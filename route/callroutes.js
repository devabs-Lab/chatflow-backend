const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");
const {
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
  getCallHistory,
  getActiveCalls,
} = require("../controller/callcontroller");

// All call routes require authentication
router.use(authmiddleware);

const { validateInitiateCall } = require("../middleware/validationSchemas");

// Call endpoints
router.post("/initiate", validateInitiateCall, initiateCall);
router.post("/:call_id/accept", acceptCall);
router.post("/:call_id/reject", rejectCall);
router.post("/:call_id/end", endCall);
router.get("/history", getCallHistory);
router.get("/active", getActiveCalls);

module.exports = router;
