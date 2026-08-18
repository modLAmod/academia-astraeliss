const DISCORD_CLIENT_ID = "1506739511969714237";
const ADMIN_DISCORD_IDS = [
  "TU_ID_PERSONAL_DE_DISCORD"
];
const DISCORD_CLIENT_SECRET = "XPJLkAVnQgtoIZ6XidiNv5d44r-Hvmvp";

let currentUser = null;

function showSection(sectionId) {
  document.querySelectorAll("main section").forEach(section => {
    section.classList.add("hidden");
  });

  document
    .getElementById(sectionId)
    .classList.remove("hidden");

  if (sectionId === "character") {
    loadCharacter();
  }

  if (sectionId === "admin") {
    loadAdmin();
  }
}

async function login() {
  const username = document.getElementById("username").value;

  const response = await fetch("/api/login", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      username,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    document.getElementById("loginError").textContent =
      data.error;

    return;
  }

  currentUser = data;

  updateNavigation();

  showSection("home");
}

async function logout() {
  await fetch("/api/logout", {
    method: "POST",
  });

  currentUser = null;

  updateNavigation();

  showSection("home");
}

async function loadCurrentUser() {
  const response = await fetch("/api/me");

  currentUser = await response.json();

  updateNavigation();
}

function updateNavigation() {
  const loginButton =
    document.getElementById("loginButton");

  const logoutButton =
    document.getElementById("logoutButton");

  const adminButton =
    document.getElementById("adminButton");

  if (currentUser) {
    loginButton.classList.add("hidden");

    logoutButton.classList.remove("hidden");
  } else {
    loginButton.classList.remove("hidden");

    logoutButton.classList.add("hidden");
  }

  if (currentUser?.role === "admin") {
    adminButton.classList.remove("hidden");
  } else {
    adminButton.classList.add("hidden");
  }
}

async function loadCharacter() {
  const form =
    document.getElementById("characterForm");

  const status =
    document.getElementById("characterStatus");

  if (!currentUser) {
    form.classList.add("hidden");

    status.innerHTML =
      "<p>Debes iniciar sesión.</p>";

    return;
  }

  const response =
    await fetch("/api/my-application");

  const application =
    await response.json();

  if (!application) {
    form.classList.remove("hidden");

    status.innerHTML = "";

    return;
  }

  if (application.status === "pending") {
    form.classList.add("hidden");

    status.innerHTML = `
      <div class="status pending">
        En espera
      </div>

      <h2>
        Tu ficha está siendo revisada.
      </h2>
    `;
  }

  if (application.status === "approved") {
    form.classList.add("hidden");

    status.innerHTML = `
      <div class="status approved">
        Aprobada
      </div>

      <h2>
        Tu ficha ha sido aprobada.
      </h2>
    `;
  }

  if (application.status === "rejected") {
    form.classList.remove("hidden");

    status.innerHTML = `
      <div class="status rejected">
        Denegada
      </div>

      <h2>
        Tu ficha ha sido denegada.
      </h2>

      <p>
        ${application.rejection_reason}
      </p>

      <p>
        Puedes volver a enviarla.
      </p>
    `;
  }
}

document
  .getElementById("characterForm")
  .addEventListener("submit", async event => {

    event.preventDefault();

    const response =
      await fetch("/api/applications", {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          character_name:
            document.getElementById(
              "characterName"
            ).value,

          age:
            document.getElementById(
              "characterAge"
            ).value,

          race:
            document.getElementById(
              "characterRace"
            ).value,

          story:
            document.getElementById(
              "characterStory"
            ).value,

        }),

      });

    const data =
      await response.json();

    if (!response.ok) {
      alert(data.error);

      return;
    }

    loadCharacter();
  });

async function loadAdmin() {
  if (
    !currentUser ||
    currentUser.role !== "admin"
  ) {
    return;
  }

  const response =
    await fetch("/api/admin/applications");

  const applications =
    await response.json();

  const container =
    document.getElementById(
      "adminApplications"
    );

  if (!applications.length) {
    container.innerHTML =
      "<p>No hay fichas.</p>";

    return;
  }

  container.innerHTML =
    applications
      .map(application => `

        <div class="application">

          <h2>
            ${application.character_name}
          </h2>

          <p>
            Usuario:
            ${application.username}
          </p>

          <p>
            Edad:
            ${application.age}
          </p>

          <p>
            Raza:
            ${application.race}
          </p>

          <p>
            ${application.story}
          </p>

          <p>
            Estado:
            ${application.status}
          </p>

          ${
            application.status === "pending"
              ? `

                <button
                  onclick="approveApplication(
                    ${application.id}
                  )"
                >
                  Aprobar
                </button>

                <button
                  onclick="rejectApplication(
                    ${application.id}
                  )"
                >
                  Denegar
                </button>

              `
              : ""
          }

        </div>

      `)
      .join("");
}

async function approveApplication(id) {
  await fetch(
    `/api/admin/applications/${id}/approve`,
    {
      method: "PATCH",
    }
  );

  loadAdmin();
}

async function rejectApplication(id) {
  const reason =
    prompt(
      "Motivo de denegación:"
    );

  if (!reason) {
    return;
  }

  await fetch(
    `/api/admin/applications/${id}/reject`,
    {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        reason,
      }),
    }
  );

  loadAdmin();
}

loadCurrentUser();
