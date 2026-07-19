import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { GuestOnly } from './auth/GuestOnly'
import { RequireAuth } from './auth/RequireAuth'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { reactRouterBasename } from './util/reactRouterBasename'
import { HomeRoute } from './pages/HomeRoute'
import { LoginScreen } from './login/LoginScreen'
import { SimvestLoginFormScreen } from './login/SimvestLoginFormScreen'
import { SignupNameScreen } from './signup/SignupNameScreen'
import { SignupCredentialsScreen } from './signup/SignupCredentialsScreen'
import { SignupSuccessScreen } from './signup/SignupSuccessScreen'
import { gamePaths } from './gameRoutes'
import { RouteFallback } from './lib/routeFallback'

const LeaderboardScreen = lazy(() =>
  import('./leaderboard/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })),
)
const GameChallengeScreen = lazy(() =>
  import('./challenge/GameChallengeScreen').then((m) => ({ default: m.GameChallengeScreen })),
)
const PerformScreen = lazy(() =>
  import('./perform/PerformScreen').then((m) => ({ default: m.PerformScreen })),
)
const PortfolioScreen = lazy(() =>
  import('./portfolio/PortfolioScreen').then((m) => ({ default: m.PortfolioScreen })),
)
const StockDetailScreen = lazy(() =>
  import('./stocks/StockDetailScreen').then((m) => ({ default: m.StockDetailScreen })),
)
const FollowingScreen = lazy(() =>
  import('./following/FollowingScreen').then((m) => ({ default: m.FollowingScreen })),
)
const TradeScreen = lazy(() =>
  import('./trade/TradeScreen').then((m) => ({ default: m.TradeScreen })),
)
const UserProfileScreen = lazy(() =>
  import('./profile/UserProfileScreen').then((m) => ({ default: m.UserProfileScreen })),
)
const CreateGameScreen = lazy(() =>
  import('./createGame/CreateGameScreen').then((m) => ({ default: m.CreateGameScreen })),
)
const CreateGameWizardScreen = lazy(() =>
  import('./createGame/CreateGameWizardScreen').then((m) => ({ default: m.CreateGameWizardScreen })),
)
const CreateGameThemeScreen = lazy(() =>
  import('./createGame/CreateGameThemeScreen').then((m) => ({ default: m.CreateGameThemeScreen })),
)
const CreateGameHostProfileScreen = lazy(() =>
  import('./createGame/CreateGameHostProfileScreen').then((m) => ({
    default: m.CreateGameHostProfileScreen,
  })),
)
const JoinGameScreen = lazy(() =>
  import('./join/JoinGameScreen').then((m) => ({ default: m.JoinGameScreen })),
)
const BrowsePublicGamesScreen = lazy(() =>
  import('./join/BrowsePublicGamesScreen').then((m) => ({ default: m.BrowsePublicGamesScreen })),
)
const GameWelcomeScreen = lazy(() =>
  import('./join/GameWelcomeScreen').then((m) => ({ default: m.GameWelcomeScreen })),
)
const JoinProfileSetupScreen = lazy(() =>
  import('./join/JoinProfileSetupScreen').then((m) => ({ default: m.JoinProfileSetupScreen })),
)
const HostJoinRequestsScreen = lazy(() =>
  import('./join/HostJoinRequestsScreen').then((m) => ({ default: m.HostJoinRequestsScreen })),
)
const SettingsScreen = lazy(() =>
  import('./settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)
const SettingsProfileScreen = lazy(() =>
  import('./settings/SettingsProfileScreen').then((m) => ({ default: m.SettingsProfileScreen })),
)
const SettingsContactScreen = lazy(() =>
  import('./settings/SettingsContactScreen').then((m) => ({ default: m.SettingsContactScreen })),
)
const SettingsPasswordScreen = lazy(() =>
  import('./settings/SettingsPasswordScreen').then((m) => ({ default: m.SettingsPasswordScreen })),
)
const SettingsPostNotificationsScreen = lazy(() =>
  import('./settings/SettingsPostNotificationsScreen').then((m) => ({
    default: m.SettingsPostNotificationsScreen,
  })),
)
const AdminScreen = lazy(() =>
  import('./admin/AdminScreen').then((m) => ({ default: m.AdminScreen })),
)

function PushNavigationBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    const onNav = (ev: Event) => {
      const url = (ev as CustomEvent<{ url?: string }>).detail?.url
      if (typeof url === 'string' && url.startsWith('/')) navigate(url)
    }
    window.addEventListener('simvest-push-nav', onNav)
    return () => window.removeEventListener('simvest-push-nav', onNav)
  }, [navigate])
  return null
}

export default function App() {
  return (
    <AppErrorBoundary>
    <BrowserRouter basename={reactRouterBasename()}>
      <PushNavigationBridge />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/admin" element={<AdminScreen />} />

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
            <Route path={gamePaths.joinPublicGames} element={<BrowsePublicGamesScreen />} />
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
      </Suspense>
    </BrowserRouter>
    </AppErrorBoundary>
  )
}
