import { db } from "./db";
import { users } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword } from "./auth";

async function seedAdminUser() {
  try {
    // Check if admin user already exists by username or email
    const existingAdmin = await db.select().from(users).where(
      or(eq(users.username, "bopper"), eq(users.email, "bopper@example.com"))
    );
    
    if (existingAdmin.length > 0) {
      console.log("Admin user already exists, updating role to admin");
      await db.update(users)
        .set({ role: "admin" })
        .where(or(eq(users.username, "bopper"), eq(users.email, "bopper@example.com")));
    } else {
      // Create the admin user with hashed password
      console.log("Creating default admin user...");
      const hashedPassword = await hashPassword("AB12cd34!");
      
      await db.insert(users).values({
        id: "admin-bopper-001", // Fixed ID for the admin user
        username: "bopper",
        email: "bopper@example.com",
        passwordHash: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        profileImageUrl: null,
      });
      console.log("Default admin user created successfully!");
    }
    
    console.log("Admin user setup complete.");
    console.log("Username: bopper");
    console.log("Password: AB12cd34!");
    console.log("Email: bopper@example.com");
    console.log("Role: admin");
    
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
}

// Run the seed function
seedAdminUser().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});