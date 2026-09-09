require("dotenv").config();

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function createService() {
  try {
    const service = await client.verify.v2.services.create({
      friendlyName: "KarmaSetu OTP",
    });

    console.log("\n================================");
    console.log("KarmaSetu OTP Service Created!");
    console.log("Service SID:", service.sid);
    console.log("================================\n");

    console.log("Add this to backend/.env:");
    console.log(
      `TWILIO_VERIFY_SERVICE_SID=${service.sid}`
    );
  } catch (error) {
    console.error("\nTwilio Error:");
    console.error(error.message);
  }
}

createService();