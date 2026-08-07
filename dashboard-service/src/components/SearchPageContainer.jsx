import { useSearch } from '../hooks/useSearch';
import SearchPage from '../ui/SearchPage';

function SearchPageContainer() {
  const { transactions, loading, error, page, setPage, prediction, setPrediction, country, toggleCountry } = useSearch();

  return (
    <SearchPage
      transactions={transactions}
      loading={loading}
      error={error}
      page={page}
      setPage={setPage}
      prediction={prediction}
      setPrediction={setPrediction}
      country={country}
      toggleCountry={toggleCountry}
    />
  );
}

export default SearchPageContainer;
