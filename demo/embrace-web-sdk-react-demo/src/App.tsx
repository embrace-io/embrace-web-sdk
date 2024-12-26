import styles from "./App.module.css";

import { Span, trace } from "@opentelemetry/api";
import { useRef, useState } from "react";

const tracer = trace.getTracer("react-client");

const App = () => {
  const currentSpan = useRef<Span | null>(null);
  const [isSpanStarted, setIsSpanStarted] = useState(false);

  const handleStartSpan = () => {
    currentSpan.current = tracer.startSpan("Demo Span");
    setIsSpanStarted(true);
  };

  const handleEndSpan = () => {
    if (currentSpan.current) {
      currentSpan.current.end();
      setIsSpanStarted(false);

      currentSpan.current = null;
    }
  };

  return (
    <>
      <div className={styles.container}>
        Demo
        <div className={styles.actions}>
          <button onClick={handleStartSpan} disabled={isSpanStarted}>
            Start Span
          </button>
          <button onClick={handleEndSpan}>End Span</button>
        </div>
      </div>
    </>
  );
};

export default App;
