import { useSearch } from '../hooks/useSearch';
import { cardStyle, sectionHeadingStyle, tableStyle, cellStyle, fraudRowStyle } from '../styles';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

const COUNTRIES = ['US', 'UK', 'CA', 'DE', 'FR', 'AU'];

function SearchPage() {
  const {
    transactions,
    loading,
    error,
    page,
    setPage,
    prediction,
    setPrediction,
    country,
    toggleCountry,
  } = useSearch();

  const filters = (
    <div style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
      <label>
        Prediction:{' '}
        <select value={prediction} onChange={(e) => setPrediction(e.target.value)}>
          <option value="">All</option>
          <option value="fraud">fraud</option>
          <option value="safe">safe</option>
        </select>
      </label>

      <div>
        Country (any selected):{' '}
        {COUNTRIES.map((c) => (
          <label key={c} style={{ marginRight: '10px' }}>
            <input type="checkbox" checked={country.includes(c)} onChange={() => toggleCountry(c)} />
            {c}
          </label>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Transaction History</h3>
        {filters}
        <LoadingIndicator />
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Transaction History</h3>
        {filters}
        <ErrorMessage message={error.message} />
      </div>
    );
  }

  if (!transactions || !transactions.data) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionHeadingStyle}>Transaction History</h3>
        {filters}
        <p>No transactions available.</p>
      </div>
    );
  }

  const { data, pagination } = transactions;

  return (
    <div style={cardStyle}>
      <h3 style={sectionHeadingStyle}>Transaction History</h3>
      {filters}

      {/* overflow-x: auto scopes horizontal scroll to this table only,
          instead of the whole page, if the viewport is too narrow for
          all 7 columns -- a normal pattern for dense tabular data. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>transactionId</th>
              <th style={cellStyle}>merchant</th>
              <th style={cellStyle}>country</th>
              <th style={cellStyle}>amount</th>
              <th style={cellStyle}>prediction</th>
              <th style={cellStyle}>riskScore</th>
              <th style={cellStyle}>timestamp</th>
            </tr>
          </thead>
          <tbody>
            {data.map((txn) => (
              <tr key={txn.transactionId} style={txn.prediction === 'fraud' ? fraudRowStyle : undefined}>
                <td style={cellStyle}>{txn.transactionId}</td>
                <td style={cellStyle}>{txn.merchant}</td>
                <td style={cellStyle}>{txn.country}</td>
                <td style={cellStyle}>{txn.amount}</td>
                <td style={cellStyle}>{txn.prediction}</td>
                <td style={cellStyle}>{txn.riskScore}</td>
                <td style={cellStyle}>{txn.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button onClick={() => setPage(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}

export default SearchPage;
