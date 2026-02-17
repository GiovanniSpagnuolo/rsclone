import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { GameLoader } from './components/GameLoader';
import { connectSocket, disconnectSocket } from './network/socket';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);

  const handleAuth = async (endpoint: 'login' | 'register') => {
    const res = await fetch(`http://localhost:3001/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username, 
        password, 
        email: `${username}@test.com` 
      })
    });

    const data = await res.json();
    
    if (res.ok && endpoint === 'login') {
      connectToGame(data.token);
    } else {
      alert(data.message || data.error);
    }
  };

  const connectToGame = (token: string) => {
    const newSocket = connectSocket(token);

    newSocket.on('connect', () => setIsLoggedIn(true));
    
    setSocket(newSocket);
  };

  useEffect(() => {
    return () => { disconnectSocket(); };
  }, []);

  if (!isLoggedIn) {
    return (
      <div style={{ padding: '2rem', maxWidth: '300px' }}>
        <h2>OSRS Clone Auth</h2>
        <input 
          placeholder="Username" 
          value={username} 
          onChange={e => setUsername(e.target.value)} 
          style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
          style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
        />
        <button onClick={() => handleAuth('login')} style={{ marginRight: '1rem' }}>Login</button>
        <button onClick={() => handleAuth('register')}>Register</button>
      </div>
    );
  }

  return <GameLoader />;
}

export default App;