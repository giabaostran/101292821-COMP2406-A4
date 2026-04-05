document.addEventListener("DOMContentLoaded", () => {
    const saveBtn = document.getElementById("saveChanges");
    
    saveBtn.addEventListener("click", async () => {
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const privacy = document.getElementById("privacy").checked; // checkbox status

        // a) Validation: Ensure all fields have values
        if (!username || !password || !confirmPassword) {
            alert("All fields are required.");
            return;
        }

        // b) Validation: Passwords must match
        if (password !== confirmPassword) {
            alert("Passwords do not match!");
            return;
        }

        const uID = window.location.pathname.split("/").pop();

        try {
            const response = await fetch(`/users/${uID}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, privacy })
            });

            const data = await response.json();
            if (data.success) {
                alert("Profile updated successfully!");
            } else {
                alert("Update failed: " + (data.error || "Unknown error"));
            }
        } catch (err) {
            alert("An error occurred while saving changes.");
        }
    });
});