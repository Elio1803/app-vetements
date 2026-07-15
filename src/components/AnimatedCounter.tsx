import { animate, useMotionValue, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { TRANSITIONS } from '../lib/animations'

interface AnimatedCounterProps {
  value: number
  suffix?: string
}

export function AnimatedCounter({ value, suffix = '' }: AnimatedCounterProps) {
  const shouldReduceMotion = useReducedMotion()
  const motionValue = useMotionValue(shouldReduceMotion ? value : 0)
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(value)
      motionValue.set(value)
      return undefined
    }

    const controls = animate(motionValue, value, {
      ...TRANSITIONS.hero,
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
    })

    return () => controls.stop()
  }, [motionValue, shouldReduceMotion, value])

  return <>{displayValue}{suffix}</>
}
