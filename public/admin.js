const adminMessage = document.querySelector("#admin-message");
const localStore = window.ManganStore;
const adminEditDialog = document.querySelector("#admin-restaurant-dialog");
const adminEditForm = document.querySelector("#admin-restaurant-form");
const adminEditMessage = document.querySelector("#admin-edit-message");
let adminRestaurants = [];
let adminUsers = [];

async function adminApi(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body && { "Content-Type": "application/json" }) },
      ...options
    });
  } catch {
    const error = new Error("Could not reach MANGAN. Check that the server is running.");
    error.offline = true;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const error = new Error("Admin tools require the Node server. Start it with START-XAMPP.bat and open http://localhost:3198.");
    error.offline = true;
    throw error;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "That request could not be completed.");
  return result;
}

function adminEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function adminFeedback(message, error = false) {
  adminMessage.textContent = message;
  adminMessage.classList.toggle("is-error", error);
}

function renderAdminData(data) {
  adminRestaurants = data.restaurants;
  adminUsers = data.users;
  document.querySelector("#stat-users").textContent = data.stats.users;
  document.querySelector("#stat-owners").textContent = data.stats.owners;
  document.querySelector("#stat-restaurants").textContent = data.stats.restaurants;
  document.querySelector("#stat-pending").textContent = data.stats.pending;

  document.querySelector("#admin-restaurants").innerHTML = data.restaurants.length ? `
    <table class="data-table"><thead><tr><th>Restaurant</th><th>Owner</th><th>Area</th><th>Estimated price / person</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${data.restaurants.map((restaurant) => `
      <tr>
        <td>${adminEscape(restaurant.name)}</td>
        <td>${restaurant.ownerId ? `${adminEscape(restaurant.ownerName || "")}<br><span class="neighborhood">${adminEscape(restaurant.ownerEmail || "")}</span>` : ""}</td>
        <td>${adminEscape(restaurant.neighborhood)}</td>
        <td>${Number(restaurant.priceMin) === 0 && Number(restaurant.priceMax) === 0 ? "Contact venue" : `₱${Number(restaurant.priceMin).toLocaleString("en-PH")}–₱${Number(restaurant.priceMax).toLocaleString("en-PH")}`}</td>
        <td><span class="status-pill ${adminEscape(restaurant.status)}">${adminEscape(restaurant.status)}</span></td>
        <td><div class="table-actions">
          <button class="table-action secondary" type="button" data-edit-id="${restaurant.id}">Edit</button>
          ${restaurant.status !== "approved" ? `<button class="table-action" type="button" data-review-id="${restaurant.id}" data-review-status="approved">Approve</button>` : ""}
          ${restaurant.status !== "rejected" ? `<button class="table-action danger" type="button" data-review-id="${restaurant.id}" data-review-status="rejected">Reject</button>` : ""}
          <button class="table-action danger" type="button" data-delete-id="${restaurant.id}">Delete</button>
        </div></td>
      </tr>`).join("")}</tbody></table>` : '<p class="dashboard-empty">No restaurant listings yet.</p>';

  document.querySelector("#admin-users").innerHTML = data.users.length ? `
    <table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Account status</th><th>Action</th></tr></thead>
    <tbody>${data.users.map((user) => `
      <tr>
        <td>${adminEscape(user.name)}</td><td>${adminEscape(user.email)}</td><td>${adminEscape(user.role)}</td>
        <td>${new Date(user.createdAt).toLocaleDateString("en-PH")}</td>
        <td><span class="status-pill ${user.isActive ? "active" : "inactive"}">${user.isActive ? "Active" : "Disabled"}</span></td>
        <td>${user.role === "admin" ? "Protected" : `<div class="table-actions"><button class="table-action ${user.isActive ? "danger" : ""}" type="button" data-user-id="${user.id}" data-user-active="${!user.isActive}">${user.isActive ? "Suspend" : "Restore"}</button><button class="table-action danger" type="button" data-delete-user-id="${user.id}">Delete</button></div>`}</td>
      </tr>`).join("")}</tbody></table>` : '<p class="dashboard-empty">No accounts yet.</p>';

  document.querySelector("#feedback-count").textContent = `${data.stats.feedback} feedback notes received`;
  document.querySelector("#admin-feedback").innerHTML = data.feedback.length ? data.feedback.map((item) => `
    <article class="feedback-item"><header><strong>${adminEscape(item.topic)}</strong><time>${new Date(item.createdAt).toLocaleString("en-PH")}</time></header><p>${adminEscape(item.message)}</p></article>
  `).join("") : '<p class="dashboard-empty feedback-empty">No feedback has arrived yet.</p>';
}

async function loadAdminData() {
  const data = await adminApi("api/admin/overview");
  renderAdminData(data);
}

function adminEditFeedback(message, error = false) {
  adminEditMessage.textContent = message;
  adminEditMessage.classList.toggle("is-error", error);
}

function openRestaurantEditor(id) {
  const restaurant = adminRestaurants.find((item) => item.id === id);
  if (!restaurant) {
    adminFeedback("That restaurant is no longer in the list. Refresh and try again.", true);
    return;
  }
  adminEditForm.reset();
  adminEditForm.elements.restaurantId.value = restaurant.id;
  adminEditForm.elements.name.value = restaurant.name;
  adminEditForm.elements.neighborhood.value = restaurant.neighborhood;
  adminEditForm.elements.address.value = restaurant.address;
  adminEditForm.elements.description.value = restaurant.description;
  adminEditForm.elements.priceMin.value = restaurant.priceMin;
  adminEditForm.elements.priceMax.value = restaurant.priceMax;
  adminEditForm.elements.hours.value = restaurant.hours;
  adminEditForm.elements.sourceUrl.value = restaurant.sourceUrl || "";
  adminEditForm.elements.imageUrl.value = restaurant.imageUrl;
  adminEditForm.elements.venueImageUrl.value = restaurant.venueImageUrl || restaurant.imageUrl;
  adminEditForm.elements.latitude.value = restaurant.latitude ?? "";
  adminEditForm.elements.longitude.value = restaurant.longitude ?? "";
  adminEditForm.elements.highlights.value = restaurant.highlights.join(", ");
  adminEditForm.querySelectorAll('input[name="categories"]').forEach((input) => {
    input.checked = restaurant.categories.includes(input.value);
  });
  adminEditForm.elements.isOpen.checked = restaurant.isOpen;
  adminEditForm.elements.featured.checked = restaurant.featured;
  adminEditFeedback("");
  adminEditDialog.showModal();
}

adminEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const restaurantId = adminEditForm.elements.restaurantId.value;
  const submitButton = document.querySelector("#admin-edit-submit");
  const values = {
    name: adminEditForm.elements.name.value,
    neighborhood: adminEditForm.elements.neighborhood.value,
    address: adminEditForm.elements.address.value,
    description: adminEditForm.elements.description.value,
    priceMin: Number(adminEditForm.elements.priceMin.value),
    priceMax: Number(adminEditForm.elements.priceMax.value),
    hours: adminEditForm.elements.hours.value,
    sourceUrl: adminEditForm.elements.sourceUrl.value,
    imageUrl: adminEditForm.elements.imageUrl.value,
    venueImageUrl: adminEditForm.elements.venueImageUrl.value,
    latitude: adminEditForm.elements.latitude.value === "" ? null : Number(adminEditForm.elements.latitude.value),
    longitude: adminEditForm.elements.longitude.value === "" ? null : Number(adminEditForm.elements.longitude.value),
    categories: [...adminEditForm.querySelectorAll('input[name="categories"]:checked')].map((input) => input.value),
    highlights: adminEditForm.elements.highlights.value.split(",").map((highlight) => highlight.trim()).filter(Boolean).slice(0, 5),
    isOpen: adminEditForm.elements.isOpen.checked,
    featured: adminEditForm.elements.featured.checked
  };
  submitButton.disabled = true;
  adminEditFeedback("");
  try {
    await adminApi(`api/admin/restaurants/${restaurantId}`, {
      method: "PUT",
      body: JSON.stringify(values)
    });
    adminEditDialog.close();
    adminFeedback("Restaurant details saved.");
    await loadAdminData();
  } catch (error) {
    adminEditFeedback(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#admin-restaurants").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    openRestaurantEditor(Number(editButton.dataset.editId));
    return;
  }
  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    const restaurantId = Number(deleteButton.dataset.deleteId);
    const restaurant = adminRestaurants.find((item) => item.id === restaurantId);
    if (!restaurant) {
      adminFeedback("That restaurant is no longer in the list. Refresh and try again.", true);
      return;
    }
    if (!window.confirm(`Permanently delete "${restaurant.name}"? This cannot be undone.`)) return;
    deleteButton.disabled = true;
    try {
      await adminApi(`api/admin/restaurants/${restaurantId}`, { method: "DELETE" });
      adminFeedback(`Deleted ${restaurant.name}.`);
      await loadAdminData();
    } catch (error) {
      adminFeedback(error.message, true);
      deleteButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-review-id]");
  if (!button) return;
  const status = button.dataset.reviewStatus;
  if (status === "rejected" && !window.confirm("Reject this restaurant listing?")) return;
  button.disabled = true;
  try {
    await adminApi(`api/admin/restaurants/${button.dataset.reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    adminFeedback(`Restaurant ${status}.`);
    await loadAdminData();
  } catch (error) {
    adminFeedback(error.message, true);
    button.disabled = false;
  }
});

document.querySelector("#admin-edit-close").addEventListener("click", () => adminEditDialog.close());
document.querySelector("#admin-edit-cancel").addEventListener("click", () => adminEditDialog.close());

document.querySelector("#admin-users").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-user-id]");
  if (deleteButton) {
    const userId = Number(deleteButton.dataset.deleteUserId);
    const user = adminUsers.find((item) => item.id === userId);
    if (!user) {
      adminFeedback("That account is no longer in the list. Refresh and try again.", true);
      return;
    }
    if (!window.confirm(`Permanently delete ${user.name}'s account? This cannot be undone.`)) return;
    deleteButton.disabled = true;
    try {
      await adminApi(`api/admin/users/${userId}`, { method: "DELETE" });
      adminFeedback(`Deleted ${user.name}'s account.`);
      await loadAdminData();
    } catch (error) {
      adminFeedback(error.message, true);
      deleteButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-user-id]");
  if (!button) return;
  const isActive = button.dataset.userActive === "true";
  if (!isActive && !window.confirm("Suspend this account? They will not be able to sign in.")) return;
  button.disabled = true;
  try {
    await adminApi(`api/admin/users/${button.dataset.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    });
    adminFeedback(isActive ? "Account restored." : "Account suspended.");
    await loadAdminData();
  } catch (error) {
    adminFeedback(error.message, true);
    button.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await adminApi("api/auth/logout", { method: "POST" });
  } catch {
    // Local demo logout should still work without the optional Node server.
  }
  if (localStore) localStore.clearCurrentUser();
  window.location.replace("login.html");
});

async function resolveAdminUser() {
  const localUser = localStore ? localStore.getCurrentUser() : null;
  if (localUser) return localUser;
  try {
    const { user } = await adminApi("api/auth/me");
    return user && localStore ? localStore.setCurrentUser(user) : user;
  } catch (error) {
    if (error.offline) return null;
    throw error;
  }
}

async function startAdminPage() {
  const user = await resolveAdminUser();
  if (!user) {
    window.location.replace("login.html?next=admin.html");
    return;
  }
  if (user.role !== "admin") {
    window.location.replace("index.html");
    return;
  }
  await loadAdminData();
}

startAdminPage().catch((error) => adminFeedback(error.message, true));
window.addEventListener("pageshow", (e) => {
  if (e.persisted) startAdminPage().catch((error) => adminFeedback(error.message, true));
});
