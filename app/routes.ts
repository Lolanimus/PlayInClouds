import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/auth.tsx"),
	route("signup", "routes/signup.tsx"),
	route("dashboard", "routes/dashboard.tsx"),
	route("listing/:id", "routes/listing.$id.tsx"),
] satisfies RouteConfig;
