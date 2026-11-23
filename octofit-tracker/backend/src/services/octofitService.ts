import { Activity, Team, User, Workout } from '../models/index.js';
import { Types } from 'mongoose';

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw httpError(`${field} is required`, 400);
  }
  return value.trim();
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRecord(input)) throw httpError('Activity details are required', 400);
  const { userId, teamId } = input;
  const type = requiredText(input.type, 'type');
  const minutes = input.minutes;

  if (!isObjectId(userId) || !isObjectId(teamId)) {
    throw httpError('userId and teamId must be valid IDs', 400);
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) {
    throw httpError('minutes must be a positive number', 400);
  }

  const [user, team] = await Promise.all([
    User.exists({ _id: new Types.ObjectId(userId) }),
    Team.exists({ _id: new Types.ObjectId(teamId) }),
  ]);
  if (!user || !team) throw httpError('The specified user or team does not exist', 404);

  return Activity.create({
    user: userId,
    team: teamId,
    type,
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRecord(input)) throw httpError('Team details are required', 400);
  const name = requiredText(input.name, 'name');
  const mascot = requiredText(input.mascot, 'mascot');
  const memberIds = input.members ?? [];

  if (!Array.isArray(memberIds) || !memberIds.every(isObjectId)) {
    throw httpError('members must be an array of valid IDs', 400);
  }

  const uniqueMemberIds = [...new Set(memberIds)];
  if (uniqueMemberIds.length > 0) {
    const membersFound = await User.countDocuments({ _id: { $in: uniqueMemberIds } });
    if (membersFound !== uniqueMemberIds.length) {
      throw httpError('One or more team members do not exist', 404);
    }
  }

  return Team.create({ name, mascot, members: uniqueMemberIds });
}

export async function getLeaderboard() {
  const [teams, totals] = await Promise.all([
    Team.find().select('name').lean(),
    Activity.aggregate<{ _id: Types.ObjectId; totalPoints: number }>([
      { $group: { _id: '$team', totalPoints: { $sum: '$points' } } },
    ]),
  ]);
  const totalsByTeam = new Map(totals.map(({ _id, totalPoints }) => [_id.toString(), totalPoints]));

  return teams
    .map((team) => ({ teamName: team.name, totalPoints: totalsByTeam.get(team._id.toString()) ?? 0 }))
    .sort((left, right) => right.totalPoints - left.totalPoints || left.teamName.localeCompare(right.teamName))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function focusForActivity(type: string) {
  const activity = type.toLowerCase();
  if (['run', 'walk', 'cycle', 'swim'].includes(activity)) return 'endurance';
  if (['strength', 'weights'].includes(activity)) return 'strength';
  if (['yoga', 'stretch', 'mobility'].includes(activity)) return 'mobility';
  return activity;
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail.toLowerCase() }).lean();
  if (!user) throw httpError('User not found', 404);

  const [recentActivity, workouts] = await Promise.all([
    Activity.findOne({ user: user._id }).sort({ occurredAt: -1 }).lean(),
    Workout.find().lean(),
  ]);
  const goal = user.fitnessGoal.toLowerCase();
  const activityFocus = recentActivity ? focusForActivity(recentActivity.type) : undefined;
  const goalMatches = workouts.filter((workout) => workout.focus.toLowerCase() === goal);
  const activityMatches = workouts.filter((workout) => workout.focus.toLowerCase() === activityFocus);
  const preferred = goalMatches.length > 0 ? goalMatches : activityMatches;
  const preferredIds = new Set(preferred.map((workout) => workout._id.toString()));
  const ordered = [...preferred, ...workouts.filter((workout) => !preferredIds.has(workout._id.toString()))];

  return ordered.map((workout) => {
    const focus = workout.focus.toLowerCase();
    const reason = focus === goal
      ? `Recommended to support your ${user.fitnessGoal} fitness goal.`
      : focus === activityFocus && recentActivity
        ? `Recommended based on your recent ${recentActivity.type} activity.`
        : 'An additional workout option for your training.';
    return { ...workout, reason };
  });
}

export { User };
