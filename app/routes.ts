import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/auth.tsx"),
	route("signup", "routes/signup.tsx"),
	route("dashboard", "routes/dashboard.tsx"),
	route("account-settings", "routes/account-settings.tsx"),
	route("host/create-listing", "routes/create-listing.tsx"),
	route("host/edit-listing/:id", "routes/edit-listing.tsx"),
	route("host", "routes/host.tsx", [
		route("dashboard", "routes/host-dashboard.tsx"),
		route("calendar", "routes/host-calendar.tsx"),
		route("reservations", "routes/host-reservations.tsx"),
		route("chat", "routes/host-chat.tsx"),
	]),
	route("chat", "routes/chat.tsx"),
	route("profile/:id", "routes/profile.$id.tsx"),
	route("payment", "routes/payment.tsx"),
	route("reservation/:id", "routes/reservation.$id.tsx"),
	route("listing/:id", "routes/listing.$id.tsx"),
] satisfies RouteConfig;
