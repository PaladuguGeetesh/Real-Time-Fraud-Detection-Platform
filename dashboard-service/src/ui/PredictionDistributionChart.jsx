import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from './Card';

// A genuine two-slice pie chart (recharts' real Pie component, same
// as the bar chart's library) -- the reference design's version of
// this chart rendered as a malformed shape, which was confirmed to be
// a rendering artifact of the mockup tool that produced it, not the
// intended design. This renders a correctly-formed circle split into
// a "Fraud" wedge and a "Safe" wedge, same red/teal color pairing and
// legend the reference otherwise shows.
function PredictionDistributionChart({ fraudToday, totalProcessed }) {
  // Per spec: safe = totalProcessed - fraudToday. fraudToday is
  // scoped to today while totalProcessed is all-time, so this skews
  // heavily toward "safe" the longer the pipeline has been running --
  // that's the formula as given, not a bug in this component.
  const safe = totalProcessed - fraudToday;
  const total = fraudToday + safe;
  // Percentage baked into the legend label text ("Fraud (2%)") to
  // match the reference -- no on-slice text labels, since a 2%-ish
  // fraud sliver has no room to render one legibly.
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const data = [
    { name: `Fraud (${pct(fraudToday)}%)`, value: fraudToday },
    { name: `Safe (${pct(safe)}%)`, value: safe },
  ];
  const sliceColors = [ 'var(--color-danger)', 'var(--color-safe)' ];

  return (
    <Card style={{ padding: '20px', width: '100%', maxWidth: 400 }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Fraud vs Safe Split</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={sliceColors[index]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default PredictionDistributionChart;
