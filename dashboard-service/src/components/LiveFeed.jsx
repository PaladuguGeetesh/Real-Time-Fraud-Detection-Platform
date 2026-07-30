import { useLiveFeed } from '../hooks/useLiveFeed';
import { cardStyle, sectionHeadingStyle, tableStyle, cellStyle, fraudRowStyle } from '../styles';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

function LiveFeed() {
  const { transactions, loading, error } = useLiveFeed();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!transactions || !transactions.data) return <p>No transactions available.</p>;

  return (
    <div style={cardStyle}>
      <h3 style={sectionHeadingStyle}>Live Feed</h3>
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
            {transactions.data.map((txn) => (
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
    </div>
  );
}

export default LiveFeed;
