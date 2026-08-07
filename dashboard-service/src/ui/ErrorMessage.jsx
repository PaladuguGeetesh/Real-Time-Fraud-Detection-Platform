// Already fully pure in its previous location (props only: message) --
// moved here unchanged in shape, restyled to the new theme tokens.
function ErrorMessage({ message }) {
  return (
    <p style={{ padding: '16px', color: 'var(--color-danger)', fontWeight: 500 }}>
      Couldn't load data{message ? `: ${message}` : ''} -- is the Backend running?
    </p>
  );
}

export default ErrorMessage;
