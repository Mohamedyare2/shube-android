const fs = require("fs");
const env = fs.readFileSync("admin-api/.env", "utf8").split("\n").reduce((acc, line) => {
  const [k, ...v] = line.split("="); if (k) acc[k.trim()] = v.join("=").trim(); return acc;
}, {});

const key = env.SUPABASE_SERVICE_ROLE_KEY;
const url = env.SUPABASE_URL;

// Step 1: Get a real JWT by logging in as admin
console.log("Step 1: Getting admin JWT...");
fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "apikey": key, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@shube.so", password: "ChangeMe123!" })
})
.then(r => r.json())
.then(auth => {
  if (!auth.access_token) { console.error("Login failed:", auth); return; }
  console.log("Got JWT:", auth.access_token.slice(0, 30) + "...");

  // Step 2: Test operator creation
  console.log("\nStep 2: Testing create operator...");
  return fetch("http://localhost:5050/api/operators", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + auth.access_token,
      "Origin": "http://localhost:5173"   // simulate browser CORS
    },
    body: JSON.stringify({
      email: "operator_test_99@shube.so",
      password: "TestPass123!",
      full_name: "Test Operator",
      username: "testop99",
      actor_id: "7ac39f63-c18a-4f43-960b-871a4b695d36"
    })
  });
})
.then(r => { if (!r) return; console.log("Status:", r.status); return r.json(); })
.then(d => { if (d) console.log("Response:", JSON.stringify(d, null, 2)); })
.catch(e => console.error("Error:", e.message));
