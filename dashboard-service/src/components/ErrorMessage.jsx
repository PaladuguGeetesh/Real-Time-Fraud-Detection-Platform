import { COLORS } from '../styles';

// Shared across every data-fetching component so a Backend outage
// (unreachable on cold load, or a request failing later) always reads
// the same way instead of each section wording it slightly differently.
function ErrorMessage({ message }) {
  return (
    <p style={{ padding: '16px', color: COLORS.fraudRed, fontWeight: 500 }}>
      Couldn't load data{message ? `: ${message}` : ''} -- is the Backend running?
    </p>
  );
}

export default ErrorMessage;
