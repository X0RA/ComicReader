export default function Offline() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1>You are offline</h1>
      <p>Please check your internet connection and try again.</p>
    </div>
  );
} 