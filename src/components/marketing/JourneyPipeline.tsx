/** 
 * JourneyPipeline - The IDEA → STORY → WRITE → REVIEW → REFINE → PRODUCE → PUBLISH → SELL journey
 * 
 * Copy per PDF plan: one short sentence per stage.
 */

import { motion } from 'framer-motion'

export function JourneyPipeline() {
  const stages = [
    { key: 'idea', title: 'IDEWA', description: 'Concept & outline' },
    { key: 'story', title: 'STORY', description: 'Characters & world' },
    { key: 'write', title: 'WRITE', description: 'Chapter generation' },
    { key: 'review', title: 'REVIEW', description: 'Editorial polish' },
    { key: 'refine', title: 'REFINE', description: 'Iterate & perfect' },
    { key: 'produce', title: 'PRODUCE', description: 'Formats & covers' },
    { key: 'publish', title: 'PUBLISH', description: 'Bookstore launch' },
    { key: 'sell', title: 'SELL', description: 'Readers & revenue' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[#050505] py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Your Book Journey
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            From spark to sold story — follow the path from idea to bookshelf.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stages.map((stage) => (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: stageKeyToIndex(stage.key) * 0.1 }}
              className="text-center"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-violet-600 mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white">
                {stage.title[0]}
              </div>
              <h3 className="text-white font-medium mb-2">{stage.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{stage.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function stageKeyToIndex(key: string): number {
  const order: Record<string, number> = {
    idea: 0,
    story: 1,
    write: 2,
    review: 3,
    refine: 4,
    produce: 5,
    publish: 6,
    sell: 7,
  }
  return order[key] || 0
}