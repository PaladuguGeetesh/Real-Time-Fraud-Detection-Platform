import { Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import Card from './Card';
import Badge from './Badge';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

const COUNTRIES = ['US', 'UK', 'CA', 'DE', 'FR', 'AU'];

const filterLabelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const selectStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: '13px',
};

function geoToggleStyle(selected) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: selected ? 'var(--color-accent)' : 'var(--color-surface)',
    color: selected ? '#fff' : 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

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
const tdStyle = { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid var(--color-border)' };
const thRightStyle = { ...thStyle, textAlign: 'right' };
const tdRightStyle = { ...tdStyle, textAlign: 'right' };
const monoStyle = { fontFamily: 'var(--font-mono)' };

const paginationButtonStyle = (disabled) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text)',
  fontSize: '13px',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

// Columns: TXN ID, Timestamp, Amount, Merchant, Geo, Risk Score --
// deliberately 6, not 7. The reference design's "User/Entity" column
// has no backing field in the real transaction data (no per-customer
// identity is tracked anywhere in this pipeline), so it was dropped
// rather than invented, per explicit instruction. `prediction` isn't
// shown as its own text column either, matching the reference exactly
// -- fraud/safe is conveyed purely through the row highlighting.
function SearchPage({ transactions, loading, error, page, setPage, prediction, setPrediction, country, toggleCountry }) {
  return (
    <div>
      <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '4px' }}>Historical Transactions</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
        Query, filter, and review processed transactions for forensic analysis.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={filterLabelStyle}>Prediction</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              style={{ ...selectStyle, appearance: 'none', paddingRight: '32px' }}
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
            >
              <option value="">All Predictions</option>
              <option value="fraud">Fraud</option>
              <option value="safe">Safe</option>
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: 'var(--color-text-tertiary)' }} />
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={filterLabelStyle}>Geo Origin</span>
          {COUNTRIES.map((c) => {
            const selected = country.includes(c);
            return (
              <button key={c} type="button" style={geoToggleStyle(selected)} onClick={() => toggleCountry(c)}>
                {selected && <Check size={12} />}
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <LoadingIndicator />}
      {!loading && error && <ErrorMessage message={error.message} />}
      {!loading && !error && (!transactions || !transactions.data) && <p>No transactions available.</p>}

      {!loading && !error && transactions && transactions.data && (
        <>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={theadStyle}>
                  <tr>
                    <th style={thStyle}>TXN ID</th>
                    <th style={thStyle}>Timestamp (UTC)</th>
                    <th style={thRightStyle}>Amount (USD)</th>
                    <th style={thStyle}>Merchant</th>
                    <th style={thStyle}>Geo</th>
                    <th style={thRightStyle}>Risk Score</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data.map((txn) => {
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
                        <td style={{ ...tdStyle, ...monoStyle, color: 'var(--color-text-secondary)' }}>{txn.timestamp}</td>
                        <td style={{ ...tdRightStyle, ...monoStyle, fontWeight: isFraud ? 700 : 400, color: isFraud ? 'var(--color-danger)' : 'var(--color-text)' }}>
                          ${txn.amount}
                        </td>
                        <td style={tdStyle}>{txn.merchant}</td>
                        <td style={tdStyle}>
                          <Badge>{txn.country}</Badge>
                        </td>
                        <td style={{ ...tdRightStyle, ...monoStyle, fontWeight: isFraud ? 700 : 400, color: isFraud ? 'var(--color-danger)' : 'var(--color-text)' }}>
                          {txn.riskScore}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Page {transactions.pagination.page} of {transactions.pagination.totalPages}
            </span>
            <button type="button" style={paginationButtonStyle(page <= 1)} onClick={() => setPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              type="button"
              style={paginationButtonStyle(page >= transactions.pagination.totalPages)}
              onClick={() => setPage(page + 1)}
              disabled={page >= transactions.pagination.totalPages}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default SearchPage;
