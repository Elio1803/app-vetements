import type { Transition, Variants } from 'framer-motion'

export const TRANSITIONS = {
  micro: { duration: 0.15, ease: 'easeOut' },
  screen: { duration: 0.25, ease: 'easeInOut' },
  hero: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  spring: { type: 'spring', stiffness: 300, damping: 25 },
} as const satisfies Record<string, Transition>

export const screenVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

export const gridVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
}

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9 },
}

export const toastVariants: Variants = {
  initial: { opacity: 0, y: -22, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.98 },
}
