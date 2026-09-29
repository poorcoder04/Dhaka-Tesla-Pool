"use client";

import DriverPanel from "@/components/driver-panel";
import RideRequestPanel from "@/components/ride-request-panel";
import {
  ApiError,
  getCurrentUser,
  login,
  signup,
  type SessionUser,
  type UserRole,
} from "@/lib/api";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type FormMode = "login" | "signup";

const SESSION_KEY = "dhaka-tesla-pool-token";
const DEMO_PASSWORD = "DhakaPoolDemo123!";

export default function AuthPortal() {
  const [mode, setMode] = useState<FormMode>("login");
  const [role, setRole] = useState<UserRole>("PASSENGER");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    const token = window.sessionStorage.getItem(SESSION_KEY);

    if (!token) {
      queueMicrotask(() => {
        if (isCurrent) setIsRestoring(false);
      });
      return () => {
        isCurrent = false;
      };
    }

    getCurrentUser(token)
      .then((currentUser) => {
        if (isCurrent) {
          setUser(currentUser);
          setSessionToken(token);
        }
      })
      .catch((restoreError: unknown) => {
        if (!isCurrent) return;

        if (restoreError instanceof ApiError && restoreError.status === 401) {
          window.sessionStorage.removeItem(SESSION_KEY);
          setError("Your session expired. Sign in again.");
        } else {
          setError("Could not verify your session. Check the API and reload.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsRestoring(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const submittedPhone = String(formData.get("phone") ?? "").trim();
    const submittedPassword = String(formData.get("password") ?? "");

    try {
      const result =
        mode === "login"
          ? await login(submittedPhone, submittedPassword)
          : await signup({
              name: String(formData.get("name") ?? "").trim(),
              phone: submittedPhone,
              ...(String(formData.get("email") ?? "").trim()
                ? { email: String(formData.get("email")).trim() }
                : {}),
              password: submittedPassword,
              role,
              ...(role === "DRIVER"
                ? {
                    vehicle: {
                      name: String(formData.get("vehicleName") ?? "").trim(),
                      model: String(formData.get("vehicleModel") ?? "").trim(),
                      plateNumber: String(
                        formData.get("plateNumber") ?? "",
                      ).trim(),
                      seatCapacity: Number(formData.get("seatCapacity")),
                    },
                  }
                : {}),
            });

      window.sessionStorage.setItem(SESSION_KEY, result.token);
      setUser(result.user);
      setSessionToken(result.token);
      setPhone("");
      setPassword("");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to sign in right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillDemoAccount(demoPhone: string) {
    setMode("login");
    setPhone(demoPhone);
    setPassword(DEMO_PASSWORD);
    setError("");
    document.getElementById("phone")?.focus();
  }

  function signOut() {
    window.sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setSessionToken("");
    setMode("login");
    setError("");
  }

  if (isRestoring) {
    return (
      <main className="loading-screen" aria-live="polite">
        <span className="brand-mark" aria-hidden="true">
          D
        </span>
        <p>Connecting to Dhaka Tesla Pool...</p>
      </main>
    );
  }

  if (user) {
    return (
      <main className="workspace-screen">
        <header className="workspace-header">
          <Link
            className="wordmark"
            href="/"
            aria-label="Dhaka Tesla Pool home"
          >
            <span className="brand-mark" aria-hidden="true">
              D
            </span>
            <span>Dhaka Tesla Pool</span>
          </Link>
          <div className="account-actions">
            <span className="account-name">{user.name}</span>
            <button className="text-button" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        {user.role === "PASSENGER" && sessionToken ? (
          <RideRequestPanel token={sessionToken} passengerName={user.name} />
        ) : (
          <DriverPanel token={sessionToken} driverName={user.name} />
        )}
        {user.role === "DRIVER" && (
          <div className="workspace-route" aria-hidden="true">
            <span>Banani</span>
            <i />
            <span>Mohakhali</span>
            <i />
            <span>Gulshan 1</span>
          </div>
        )}
      </main>
    );
  }

  const isSignup = mode === "signup";

  return (
    <main className="auth-layout">
      <section className="brand-panel" aria-labelledby="brand-heading">
        <div className="brand-topline">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span className="brand-caption">DHAKA / BANANI</span>
        </div>
        <div className="brand-story">
          <p className="eyebrow">8:41 AM / ROAD 11</p>
          <h1 id="brand-heading">Dhaka Tesla Pool</h1>
          <p className="brand-tagline">
            Share a seat. Split the fare. Survive Dhaka traffic.
          </p>
          <div
            className="route-visual"
            aria-label="Example routes from Banani to Mohakhali and Gulshan 1"
          >
            <div className="route-heading">
              <span>THIS MORNING</span>
              <span>3 SEATS / BULLET</span>
            </div>
            <div className="route-stops">
              <div className="route-stop">
                <span className="stop-dot" />
                <span>
                  <small>PICKUP</small>
                  <strong>Banani</strong>
                </span>
              </div>
              <div className="route-branch" />
              <div className="route-stop">
                <span className="stop-dot stop-dot-coral" />
                <span>
                  <small>DROP-OFF</small>
                  <strong>Mohakhali</strong>
                </span>
              </div>
              <div className="route-stop route-stop-alt">
                <span className="stop-dot stop-dot-blue" />
                <span>
                  <small>ALSO RIDING</small>
                  <strong>Gulshan 1</strong>
                </span>
              </div>
            </div>
            <div className="route-footer">
              <span>Jashim</span>
              <span>2 requests / 1 Tesla</span>
            </div>
          </div>
        </div>
        <footer className="brand-footer">A better way across the city.</footer>
      </section>

      <section className="access-panel" aria-labelledby="form-heading">
        <div className="auth-card">
          <div className="auth-heading-row">
            <div>
              <p className="eyebrow">YOUR RIDE STARTS HERE</p>
              <h2 id="form-heading">
                {isSignup ? "Create account" : "Welcome back"}
              </h2>
            </div>
            <span className="auth-index">01 / 07</span>
          </div>

          <div className="mode-switch" role="group" aria-label="Account access">
            <button
              type="button"
              aria-pressed={!isSignup}
              className={!isSignup ? "mode-active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={isSignup}
              className={isSignup ? "mode-active" : ""}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <>
                <label className="field-label" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  required
                />

                <div className="field-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="phone">
                      Phone number
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      pattern="01[3-9][0-9]{8}"
                      maxLength={11}
                      placeholder="01712345678"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      required
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="email">
                      Email <span>Optional</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <span className="field-label">I am joining as</span>
                <div
                  className="role-switch"
                  role="group"
                  aria-label="Choose account type"
                >
                  <button
                    type="button"
                    aria-pressed={role === "PASSENGER"}
                    className={role === "PASSENGER" ? "role-active" : ""}
                    onClick={() => setRole("PASSENGER")}
                  >
                    Passenger
                  </button>
                  <button
                    type="button"
                    aria-pressed={role === "DRIVER"}
                    className={role === "DRIVER" ? "role-active" : ""}
                    onClick={() => setRole("DRIVER")}
                  >
                    Driver
                  </button>
                </div>

                {role === "DRIVER" && (
                  <fieldset className="vehicle-fields">
                    <legend>Vehicle details</legend>
                    <label className="field-label" htmlFor="vehicleName">
                      Vehicle name
                    </label>
                    <input
                      id="vehicleName"
                      name="vehicleName"
                      placeholder="Bullet"
                      required
                    />
                    <div className="field-row">
                      <div className="field-group">
                        <label className="field-label" htmlFor="vehicleModel">
                          Model
                        </label>
                        <input id="vehicleModel" name="vehicleModel" required />
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="seatCapacity">
                          Passenger seats
                        </label>
                        <select
                          id="seatCapacity"
                          name="seatCapacity"
                          defaultValue="3"
                        >
                          {[1, 2, 3, 4, 5, 6].map((seats) => (
                            <option key={seats} value={seats}>
                              {seats}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="field-label" htmlFor="plateNumber">
                      Plate number
                    </label>
                    <input id="plateNumber" name="plateNumber" required />
                  </fieldset>
                )}
              </>
            )}

            {!isSignup && (
              <>
                <label className="field-label" htmlFor="phone">
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="01[3-9][0-9]{8}"
                  maxLength={11}
                  placeholder="01712345678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </>
            )}

            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="submit-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Connecting..."
                : isSignup
                  ? "Create account"
                  : "Sign in"}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </form>

          {!isSignup && (
            <div className="demo-access">
              <div className="demo-title">
                <span>DEMO ACCESS</span>
                <span>LOCAL SEED DATA</span>
              </div>
              <div className="demo-buttons">
                <button
                  type="button"
                  onClick={() => fillDemoAccount("01700000002")}
                >
                  <span>Nusrat</span>
                  <small>Passenger</small>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount("01700000001")}
                >
                  <span>Jashim</span>
                  <small>Driver</small>
                </button>
              </div>
            </div>
          )}

          <p className="privacy-note">
            Your session stays in this browser tab and ends when you close it.
          </p>
        </div>
        <footer className="access-footer">
          <span>Dhaka / Bangladesh</span>
          <span>Passengers first, always.</span>
        </footer>
      </section>
    </main>
  );
}
