import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoginForm from '../ui/LoginForm';

function LoginPageContainer() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(username, password) {
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      // Backend returns a deliberately generic 401 message; this falls
      // back to the same wording if the request never reached it
      // (e.g. the Backend is unreachable), rather than leaking which
      // case it was.
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  }

  return <LoginForm onSubmit={handleSubmit} submitting={submitting} error={error} />;
}

export default LoginPageContainer;
