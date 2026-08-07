import { Link } from 'react-router-dom';
import { Filter } from 'lucide-react';
import Card from './Card';
import Badge from './Badge';

const theadStyle = { background: 'var(--color-surface-alt)' };
const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--color-border)',
};
const thRightStyle = { ...thStyle, textAlign: 'right' };
const tdStyle = { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid var(--color-border)' };
const tdRightStyle = { ...tdStyle, textAlign: 'right' };
const monoStyle = { fontFamily: 'var(--font-mono)' };

// Same 7 columns and fraud-row treatment as before the split. "Filter"
// and "View All Transactions" both link to /search -- the app's one
// real filtering/full-history screen -- rather than being decorative:
// this table itself has no filter capability of its own (always the
// most recent 20, unfiltered; see LiveFeedContext), so both point at
// the page that actually does what they suggest.
function LiveFeedTable({ transactions }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Live Transaction Feed</h3>
        <Link
          to="/search"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--color-accent-text)', textDecoration: 'none' }}
        >
          <Filter size={14} />
          Filter
        </Link>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={theadStyle}>
            <tr>
              <th style={thStyle}>Transaction ID</th>
              <th style={thStyle}>Merchant</th>
              <th style={thStyle}>Country</th>
              <th style={thRightStyle}>Amount</th>
              <th style={thStyle}>Prediction</th>
              <th style={thRightStyle}>Risk Score</th>
              <th style={thStyle}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => {
              const isFraud = txn.prediction === 'fraud';
              return (
                <tr
                  key={txn.transactionId}
                  style={
                    isFraud
                      ? { background: 'var(--color-danger-bg)', borderLeft: '4px solid var(--color-danger-border)' }
                      : undefined
                  }
                >
                  <td style={{ ...tdStyle, ...monoStyle, fontWeight: isFraud ? 700 : 400, color: isFraud ? 'var(--color-danger)' : 'var(--color-text)' }}>
                    {txn.transactionId}
                  </td>
                  <td style={tdStyle}>{txn.merchant}</td>
                  <td style={tdStyle}>{txn.country}</td>
                  <td style={{ ...tdRightStyle, ...monoStyle, fontWeight: isFraud ? 700 : 400, color: isFraud ? 'var(--color-danger)' : 'var(--color-text)' }}>
                    ${txn.amount}
                  </td>
                  <td style={tdStyle}>
                    <Badge tone={isFraud ? 'danger' : 'safe'} variant="solid">
                      {isFraud ? 'Fraud' : 'Safe'}
                    </Badge>
                  </td>
                  <td style={{ ...tdRightStyle, ...monoStyle, fontWeight: isFraud ? 700 : 400, color: isFraud ? 'var(--color-danger)' : 'var(--color-text)' }}>
                    {txn.riskScore}
                  </td>
                  <td style={{ ...tdStyle, ...monoStyle, color: 'var(--color-text-secondary)' }}>{txn.timestamp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', padding: '14px', borderTop: '1px solid var(--color-border)' }}>
        <Link to="/search" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-accent-text)', textDecoration: 'none' }}>
          View All Transactions
        </Link>
      </div>
    </Card>
  );
}

export default LiveFeedTable;
