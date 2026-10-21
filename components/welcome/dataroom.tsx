import { useRouter } from "next/router";

import { motion } from "motion/react";

import { STAGGER_CHILD_VARIANTS } from "@/lib/constants";

import { Button } from "../ui/button";

export default function Dataroom() {
  const router = useRouter();
  return (
    <motion.div
      className="z-10 mx-5 flex flex-col items-center space-y-10 text-center sm:mx-auto"
      variants={{
        hidden: { opacity: 0, scale: 0.95 },
        show: {
          opacity: 1,
          scale: 1,
          transition: {
            staggerChildren: 0.2,
          },
        },
      }}
      initial="hidden"
      animate="show"
      exit="hidden"
      transition={{ duration: 0.3, type: "spring" }}
    >
      <motion.div
        variants={STAGGER_CHILD_VARIANTS}
        className="flex flex-col items-center space-y-10 text-center"
      >
        <p className="text-2xl font-bold tracking-tighter text-foreground">
          JANAVY
        </p>
        <h1 className="font-display max-w-xl text-3xl font-semibold transition-colors sm:text-4xl">
          Get started with data rooms!
        </h1>
      </motion.div>
      <motion.div
        variants={STAGGER_CHILD_VARIANTS}
        className="mx-auto mt-16 flex w-full items-center justify-center rounded-2xl border border-black/10 px-10 py-12 dark:border-white/10"
        style={{
          background:
            "radial-gradient(70% 60% at 70% 10%, rgba(18,61,255,0.22) 0%, rgba(18,61,255,0) 60%)",
        }}
      >
        <img
          src="/images/branding/jv-symbol-transparent.png"
          alt="Janavy data rooms"
          className="h-24 w-auto"
        />
      </motion.div>

      <motion.div
        variants={STAGGER_CHILD_VARIANTS}
        className="mt-10 flex flex-col items-center space-y-4 text-center"
      >
        <Button
          className="px-10 text-base font-medium"
          onClick={() => router.push("/datarooms")}
        >
          Go to data rooms
        </Button>
        <span className="text-xs text-muted-foreground">
          Data rooms are available on every JANAVY deployment.
        </span>
      </motion.div>
    </motion.div>
  );
}
