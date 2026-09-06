import { useEffect, useRef, useState } from "react";

/**
 * Brief pulse the moment a verse becomes selected, for clear tap feedback.
 * @returns {boolean} true while the `just-selected` class should be applied
 */
export function useSelectPulse(selected, ms = 260) {
  const [pulse, setPulse] = useState(false);
  const was = useRef(selected);
  const timer = useRef(null);

  useEffect(() => {
    if (selected && !was.current) {
      setPulse(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPulse(false), ms);
    }
    was.current = selected;
  }, [selected, ms]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return pulse;
}

export default useSelectPulse;
