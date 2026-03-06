export default async function globalSetup() {
  await fetch('http://localhost:3001/received-spans', { method: 'DELETE' });
}
