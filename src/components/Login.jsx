import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('Failed to log in. Please check your credentials.');
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="auth-container fade-in">
      <div className="glass-panel auth-panel">
        <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>Welcome Back</h2>
        {error && <div className="alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button disabled={loading} type="submit" className="btn-primary" style={{ marginTop: '16px' }}>
            Log In
          </button>
        </form>
        <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Need an account? <Link to="/register">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
