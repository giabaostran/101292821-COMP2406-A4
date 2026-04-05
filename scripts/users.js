document.addEventListener("DOMContentLoaded", () => {
  const removeIcons = document.querySelectorAll(".remove-user-icon");

  removeIcons.forEach((icon) => {
    icon.addEventListener("click", async (e) => {
      const userId = e.target.getAttribute("data-id");

      // 1. Confirm whether the user is to be removed
      const confirmed = confirm(
        "Are you sure you want to completely remove this user?",
      );

      if (confirmed) {
        try {
          // 2. Send a DELETE request to the server
          const result = await fetch(`/users/${userId}`, {
            method: "DELETE",
          });

          console.log(result);

          if (result.status === 200) {
            alert("User removed successfully.");
            location.reload();
          } else {
            alert(
              "Failed to remove user: " + (result.error || "Unknown error"),
            );
          }
        } catch (err) {
          console.log(err);
          alert("Communication error while trying to remove the user.");
        }
      }
    });
  });
});
