import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

type Suggestion = { _id?: string; title: string; focus?: string; minutes?: number; difficulty?: string; reason: string };

export default function Workouts() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    getJson<{ suggestions: Suggestion[] }>(`/api/workouts/suggestions/${encodeURIComponent('mona@example.com')}`)
      .then(({ suggestions: result }) => { if (active) setSuggestions(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unknown error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="card"><div className="card-body">
    <h2 className="h4">Workout suggestions</h2>
    <p>Recommend workouts from activity patterns.</p>
    {loading ? <p role="status">Loading workout suggestions...</p> : error ? <p role="alert">Unable to load workout suggestions: {error}</p> :
      suggestions.length === 0 ? <p>No workout suggestions yet.</p> :
        <ul>{suggestions.map((suggestion, index) => <li key={suggestion._id ?? `${suggestion.title}-${index}`}>
          <strong>{suggestion.title}</strong>{suggestion.focus ? ` — ${suggestion.focus}` : ''}
          {suggestion.minutes ? `, ${suggestion.minutes} minutes` : ''}
          {suggestion.difficulty ? ` (${suggestion.difficulty})` : ''}
          <p>{suggestion.reason}</p>
        </li>)}</ul>}
  </div></section>;
}
