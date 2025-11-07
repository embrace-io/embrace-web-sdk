import SDKTest from '@/components/SDKTest';
import { logInfo } from '@/helpers/log';
import styles from './page.module.css';

export default function Home() {
  logInfo('Rendering home');

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Next Test App</h1>
        <SDKTest />
      </main>
    </div>
  );
}
