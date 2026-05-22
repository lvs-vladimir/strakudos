package com.strava.kudos

class StrategyEngine(
    private val context: BotContext
) {
    fun create(strategyType: BotStrategyType): BotStrategy {
        return when (strategyType) {
            BotStrategyType.SMART -> SmartStrategy(context)
            BotStrategyType.TOP_ONLY -> TopOnlyStrategy(context)
            BotStrategyType.AGGRESSIVE -> AggressiveStrategy(context)
            BotStrategyType.HUMAN -> HumanStrategy(context)
            BotStrategyType.CLUBS -> ClubsStrategy(context)
        }
    }
}
