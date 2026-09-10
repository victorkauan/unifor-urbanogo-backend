import http from "k6/http";
import { check } from "k6";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function authHeaders(token) {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } };
}

export function registerAndLogin(baseUrl, { name, email, password, role }) {
  const register = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify({ name, email, password, role }),
    { headers: JSON_HEADERS },
  );
  check(register, { "auth/register: 201": (r) => r.status === 201 });

  const login = http.post(`${baseUrl}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
  });
  check(login, { "auth/login: 200": (r) => r.status === 200 });

  const body = login.json();
  return { userId: body?.data?.user?.id, token: body?.data?.token };
}

export function createDriverProfile(baseUrl, token, overrides = {}) {
  const res = http.post(
    `${baseUrl}/drivers/me`,
    JSON.stringify({
      service_preference: "both",
      vehicle_model: "Onix",
      vehicle_plate: "ABC1D23",
      ...overrides,
    }),
    authHeaders(token),
  );
  check(res, { "drivers/me create: 201": (r) => r.status === 201 });
  return res.json()?.data?.driver;
}

export function setDriverAvailability(baseUrl, token, isOnline) {
  const res = http.put(
    `${baseUrl}/drivers/me/availability`,
    JSON.stringify({ is_online: isOnline }),
    authHeaders(token),
  );
  check(res, { "drivers/me/availability: 200": (r) => r.status === 200 });
  return res;
}

export function createRide(baseUrl, token, { type, origin, destination }) {
  return http.post(
    `${baseUrl}/rides`,
    JSON.stringify({ type, origin, destination }),
    authHeaders(token),
  );
}

export function getRide(baseUrl, token, rideId) {
  return http.get(`${baseUrl}/rides/${rideId}`, authHeaders(token));
}

export function cancelRide(baseUrl, token, rideId, reason) {
  return http.post(
    `${baseUrl}/rides/${rideId}/cancel`,
    JSON.stringify({ reason }),
    authHeaders(token),
  );
}

export function acceptOffer(baseUrl, token, offerId) {
  return http.post(`${baseUrl}/offers/${offerId}/accept`, "{}", authHeaders(token));
}

export function arriveRide(baseUrl, token, rideId) {
  return http.post(`${baseUrl}/rides/${rideId}/arrive`, "{}", authHeaders(token));
}

export function startRide(baseUrl, token, rideId) {
  return http.post(`${baseUrl}/rides/${rideId}/start`, "{}", authHeaders(token));
}

export function completeRide(baseUrl, token, rideId) {
  return http.post(`${baseUrl}/rides/${rideId}/complete`, "{}", authHeaders(token));
}
