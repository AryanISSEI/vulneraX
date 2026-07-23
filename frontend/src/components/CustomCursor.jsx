import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Navigation } from 'lucide-react';

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Use MotionValues to avoid React re-renders on every mouse move
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const cursorRotation = useMotionValue(0);
  const lastPos = useRef({ x: -100, y: -100 });

  // Springs for the pointer position and rotation
  const pointerX = useSpring(cursorX, { stiffness: 600, damping: 30, mass: 0.5 });
  const pointerY = useSpring(cursorY, { stiffness: 600, damping: 30, mass: 0.5 });
  const pointerRotation = useSpring(cursorRotation, { stiffness: 400, damping: 30, mass: 0.5 });

  useEffect(() => {
    const updateMousePosition = (e) => {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      
      // Only update rotation if moved significantly to avoid jitter
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        // Calculate angle of movement
        let targetAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // +90 because Navigation points UP
        let currentAngle = cursorRotation.get();
        
        // Find shortest rotation path to avoid sudden 360-degree spins
        let diff = targetAngle - currentAngle;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        
        cursorRotation.set(currentAngle + diff);
      }

      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      lastPos.current = { x: e.clientX, y: e.clientY };
      
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseOver = (e) => {
      const target = e.target;
      if (
        target.tagName.toLowerCase() === 'button' ||
        target.tagName.toLowerCase() === 'a' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('cursor-pointer') ||
        window.getComputedStyle(target).cursor === 'pointer'
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', updateMousePosition);
    window.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
      window.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [isVisible, cursorX, cursorY, cursorRotation]);

  // Hide default cursor globally
  useEffect(() => {
    document.body.style.cursor = 'none';
    const style = document.createElement('style');
    style.innerHTML = `
      * { cursor: none !important; }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.body.style.cursor = 'auto';
      document.head.removeChild(style);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] text-primary flex items-center justify-center filter drop-shadow-[0_0_15px_var(--color-primary)]"
        style={{
          x: pointerX,
          y: pointerY,
          rotate: pointerRotation,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isHovering ? 1.3 : 1,
          opacity: isHovering ? 1 : 0.9,
        }}
      >
        <Navigation className="w-5 h-5 fill-primary stroke-primary" />
      </motion.div>
    </>
  );
}
