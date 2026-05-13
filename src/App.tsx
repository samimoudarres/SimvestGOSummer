import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LeaderboardScreen } from './leaderboard/LeaderboardScreen'
import { HomeRoute } from './pages/HomeRoute'
import { GameChallengeScreen } from './challenge/GameChallengeScreen'
import { PerformScreen } from './perform/PerformScreen'
import { PortfolioScreen } from './portfolio/PortfolioScreen'
import { StockDetailScreen } from './stocks/StockDetailScreen'
import { FollowingScreen } from './following/FollowingScreen'
import { TradeScreen } from './trade/TradeScreen'
import { UserProfileScreen } from './profile/UserProfileScreen'
import { CreateGameScreen } from './createGame/CreateGameScreen'
import { CreateGameWizardScreen } from './createGame/CreateGameWizardScreen'
import { CreateGameThemeScreen } from './createGame/CreateGameThemeScreen'
import { JoinGameScreen } from './join/JoinGameScreen'
import { GameWelcomeScreen } from './join/GameWelcomeScreen'
import { JoinProfileSetupScreen } from './join/JoinProfileSetupScreen'
import { HostJoinRequestsScreen } from './join/HostJoinRequestsScreen'
import { gamePaths } from './gameRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path={gamePaths.createGame} element={<CreateGameScreen />} />
        <Route path={gamePaths.createGameWizard} element={<CreateGameWizardScreen />} />
        <Route path={gamePaths.createGameTheme} element={<CreateGameThemeScreen />} />
        <Route path="/join/welcome" element={<GameWelcomeScreen />} />
        <Route path="/join/profile-setup" element={<JoinProfileSetupScreen />} />
        <Route path="/join" element={<JoinGameScreen />} />
        <Route path="/g/:gameSlug/join-requests" element={<HostJoinRequestsScreen />} />
        <Route path="/g/:gameSlug" element={<GameChallengeScreen />} />
        <Route path="/g/:gameSlug/perform" element={<PerformScreen />} />
        <Route path="/g/:gameSlug/portfolio" element={<PortfolioScreen />} />
        <Route path="/g/:gameSlug/trade" element={<TradeScreen />} />
        <Route path="/g/:gameSlug/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/g/:gameSlug/following" element={<FollowingScreen />} />
        <Route path="/g/:gameSlug/profile/:userId" element={<UserProfileScreen />} />
        <Route path="/stock/:ticker" element={<StockDetailScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
