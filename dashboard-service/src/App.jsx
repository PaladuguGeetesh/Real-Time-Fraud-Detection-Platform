import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { ThemeProvider } from './state/ThemeContext';
import { StreamProvider } from './state/StreamContext';
import { StatsProvider } from './state/StatsContext';
import { LiveFeedProvider } from './state/LiveFeedContext';
import { SearchProvider } from './state/SearchContext';
import StatsCardsContainer from './components/StatsCardsContainer';
import LiveFeedContainer from './components/LiveFeedContainer';
import SearchPageContainer from './components/SearchPageContainer';
import FraudAlertContainer from './components/FraudAlertContainer';
import TopRiskChartContainer from './components/TopRiskChartContainer';
import PredictionDistributionChartContainer from './components/PredictionDistributionChartContainer';
import LoginPageContainer from './components/LoginPageContainer';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayoutContainer from './components/AppLayoutContainer';

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const chartsRowStyle = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
};

function DashboardPage() {
  return (
    <StreamProvider>
      <StatsProvider>
        <LiveFeedProvider>
          <div style={pageStyle}>
            <FraudAlertContainer />
            <StatsCardsContainer />
            <div style={chartsRowStyle}>
              <TopRiskChartContainer />
              <PredictionDistributionChartContainer />
            </div>
            <LiveFeedContainer />
          </div>
        </LiveFeedProvider>
      </StatsProvider>
    </StreamProvider>
  );
}

function SearchRoute() {
  return (
    <SearchProvider>
      <SearchPageContainer />
    </SearchProvider>
  );
}

// Navigation is now the sidebar (ui/Sidebar.jsx, wired in
// components/AppLayoutContainer.jsx) instead of the old plain text
// links -- ProtectedRoute stays outside the layout shell so a logged-
// out visitor gets redirected to /login without the header/sidebar
// ever rendering.
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPageContainer />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayoutContainer>
                    <DashboardPage />
                  </AppLayoutContainer>
                </ProtectedRoute>
              }
            />
            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <AppLayoutContainer>
                    <SearchRoute />
                  </AppLayoutContainer>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
