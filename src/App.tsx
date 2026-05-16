import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly } from './auth/GuestOnly'
import { RequireAuth } from './auth/RequireAuth'
import { reactRouterBasename } from './util/reactRouterBasename'
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
import { CreateGameHostProfileScreen } from './createGame/CreateGameHostProfileScreen'
import { JoinGameScreen } from './join/JoinGameScreen'
import { GameWelcomeScreen } from './join/GameWelcomeScreen'
import { JoinProfileSetupScreen } from './join/JoinProfileSetupScreen'
import { HostJoinRequestsScreen } from './join/HostJoinRequestsScreen'
import { LoginScreen } from './login/LoginScreen'
import { SimvestLoginFormScreen } from './login/SimvestLoginFormScreen'
import { SignupNameScreen } from './signup/SignupNameScreen'
import { SignupCredentialsScreen } from './signup/SignupCredentialsScreen'
import { SignupSuccessScreen } from './signup/SignupSuccessScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { SettingsProfileScreen } from './settings/SettingsProfileScreen'
import { SettingsContactScreen } from './settings/SettingsContactScreen'
import { SettingsPasswordScreen } from './settings/SettingsPasswordScreen'
import { SettingsPostNotificationsScreen } from './settings/SettingsPostNotificationsScreen'
import { gamePaths } from './gameRoutes'

export default function App() {
  return (
    <BrowserRouter basename={reactRouterBasename()}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/login/sign-in" element={<SimvestLoginFormScreen />} />
          <Route path="/signup" element={<Navigate to="/signup/name" replace />} />
          <Route path="/signup/name" element={<SignupNameScreen />} />
          <Route path="/signup/credentials" element={<SignupCredentialsScreen />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/signup/success" element={<SignupSuccessScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/profile" element={<SettingsProfileScreen />} />
          <Route path="/settings/contact" element={<SettingsContactScreen />} />
          <Route path="/settings/password" element={<SettingsPasswordScreen />} />
          <Route path="/settings/post-notifications" element={<SettingsPostNotificationsScreen />} />
          <Route path={gamePaths.createGame} element={<CreateGameScreen />} />
          <Route path={gamePaths.createGameWizard} element={<CreateGameWizardScreen />} />
          <Route path={gamePaths.createGameTheme} element={<CreateGameThemeScreen />} />
          <Route path={gamePaths.createGameHostProfile} element={<CreateGameHostProfileScreen />} />
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
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
