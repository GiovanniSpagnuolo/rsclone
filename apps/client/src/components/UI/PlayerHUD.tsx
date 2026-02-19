import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../network/socket';

interface PlayerHUDProps {
  position: [number, number, number];
}

export const PlayerHUD = ({ position }: PlayerHUDProps) => {
  // --- Stamina & Run State ---
  const [isRunning, setIsRunning] = useState(false);
  const [stamina, setStamina] = useState(100);
  const [isMoving, setIsMoving] = useState(false);
  
  const lastPos = useRef(position);
  const moveTimeout = useRef<NodeJS.Timeout | null>(null);

  // --- Chat State ---
  const [messages, setMessages] = useState<string[]>(["Welcome to the realm."]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Movement Detection (For Stamina Drain)
  useEffect(() => {
    const hasMoved = lastPos.current[0] !== position[0] || lastPos.current[2] !== position[2];
    
    if (hasMoved) {
      setIsMoving(true);
      lastPos.current = position;
      
      if (moveTimeout.current) clearTimeout(moveTimeout.current);
      moveTimeout.current = setTimeout(() => setIsMoving(false), 700);
    }
  }, [position]);

  const toggleRun = () => {
    const newState = !isRunning;
    setIsRunning(newState);
    const socket = getSocket();
    if (socket) socket.emit('toggle_run', { isRunning: newState });
  };

  // 2. Stamina Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setStamina(prev => {
        if (isRunning && isMoving && prev > 0) return Math.max(0, prev - 1);
        if ((!isRunning || !isMoving) && prev < 100) return Math.min(100, prev + 0.5);
        return prev;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning, isMoving]);

  useEffect(() => {
    if (stamina === 0 && isRunning) toggleRun();
  }, [stamina, isRunning]);

    // 3. Socket Listener for Server Messages
      useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const handleServerMessage = (payload: any) => {
          // Safely extract the text whether the server sends a string or a JSON object
          let text = '';
          if (typeof payload === 'string') {
            text = payload;
          } else if (payload && payload.message) {
            text = payload.message;
          } else {
            return; // Ignore payloads we don't understand
          }
          
          setMessages(prev => [...prev, text]);
        };

        socket.on('server_message', handleServerMessage);
        return () => {
          socket.off('server_message', handleServerMessage);
        };
      }, []);

  // 4. Auto-Scroll Chat to Bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
      
      {/* --- TOP RIGHT: Stamina & Run --- */}
      <div style={{ position: 'absolute', top: 20, right: 20, width: 150, pointerEvents: 'auto' }}>
        <button
          onClick={toggleRun}
          style={{
            width: '100%', padding: '10px',
            backgroundColor: isRunning ? '#2d5a27' : '#333',
            color: '#f0e68c', border: '2px solid #1a1a1a',
            cursor: 'pointer', fontWeight: 'bold', fontFamily: 'monospace'
          }}
        >
          {isRunning ? '🏃 RUNNING' : '🚶 WALKING'}
        </button>
        <div style={{ width: '100%', height: '12px', backgroundColor: '#222', marginTop: '5px', border: '1px solid #000' }}>
          <div style={{ width: `${stamina}%`, height: '100%', backgroundColor: '#f0e68c', transition: 'width 0.1s linear' }} />
        </div>
      </div>

      {/* --- BOTTOM LEFT: Chat Box --- */}
      <div style={{
        position: 'absolute', bottom: 20, left: 20, width: 450, height: 160,
        backgroundColor: 'rgba(184, 164, 127, 0.85)', // OSRS-style parchment color
        border: '3px solid #4a3b22', borderRadius: '4px',
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto'
      }}>
        {/* Chat Header */}
        <div style={{
          height: '24px', backgroundColor: 'rgba(74, 59, 34, 0.9)',
          color: '#f0e68c', fontFamily: 'monospace', fontSize: '12px',
          display: 'flex', alignItems: 'center', paddingLeft: '8px', borderBottom: '2px solid #2a1b02'
        }}>
          Game Messages
        </div>
        
        {/* Messages Container */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '8px',
          fontFamily: 'monospace', fontSize: '14px', color: '#000',
          textShadow: '1px 1px 0px rgba(255,255,255,0.3)'
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '4px' }}>{msg}</div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

    </div>
  );
};
