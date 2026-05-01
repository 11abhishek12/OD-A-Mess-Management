import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('permanent'); // default
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      return setError('Passwords do not match');
    }
    try {
      setError('');
      setLoading(true);
      await register(email, password, name, role);
      navigate('/');
    } catch (err) {
      setError('Failed to create an account.');
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="auth-container fade-in">
      <div className="glass-panel auth-panel">
        <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>Join the Mess</h2>
        {error && <div className="alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              required 
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
            <label>Member Type</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="permanent">Permanent Member</option>
              <option value="guest">Guest Member</option>
            </select>
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
          <div className="form-group">
            <label>Confirm Password</label>
            <input 
              type="password" 
              required 
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          <button disabled={loading} type="submit" className="btn-primary" style={{ marginTop: '16px' }}>
            Sign Up
          </button>
        </form>
        <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login">Log In</Link>
        </div>
      </div>
    </div>
  );
}
