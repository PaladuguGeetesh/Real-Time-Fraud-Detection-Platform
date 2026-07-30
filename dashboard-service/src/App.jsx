import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { StreamProvider } from './state/StreamContext';
import { StatsProvider } from './state/StatsContext';
import { LiveFeedProvider } from './state/LiveFeedContext';
import { SearchProvider } from './state/SearchContext';
import StatsCards from './components/StatsCards';
import LiveFeed from './components/LiveFeed';
import SearchPage from './components/SearchPage';
import FraudAlert from './components/FraudAlert';
import TopRiskChart from './components/TopRiskChart';
import PredictionDistributionChart from './components/PredictionDistributionChart';

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

function DashboardPage() {
  return (
    <StreamProvider>
      <StatsProvider>
        <LiveFeedProvider>
          <div style={pageStyle}>
            <nav>
              <Link to="/search">View Transaction History</Link>
            </nav>
            <FraudAlert />
            <StatsCards />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <TopRiskChart />
              <PredictionDistributionChart />
            </div>
            <LiveFeed />
          </div>
        </LiveFeedProvider>
      </StatsProvider>
    </StreamProvider>
  );
}

function SearchRoute() {
  return (
    <SearchProvider>
      <div style={pageStyle}>
        <nav>
          <Link to="/">Back to Live Dashboard</Link>
        </nav>
        <SearchPage />
      </div>
    </SearchProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/search" element={<SearchRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
