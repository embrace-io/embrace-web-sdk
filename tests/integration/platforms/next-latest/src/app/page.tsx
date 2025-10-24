import SDKTest from '@/components/SDKTest';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Next Test App</h1>
        <SDKTest />
      </main>
    </div>
  );
}
