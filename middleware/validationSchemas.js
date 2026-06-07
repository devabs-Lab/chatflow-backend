const validateRequest = require("./validateRequest");

const registerSchema = {
  body: {
    username: { required: true, type: "string", minLength: 3, maxLength: 50 },
    email: { required: true, type: "string", email: true },
    password: { required: true, type: "string", minLength: 8 },
    firstname: { required: true, type: "string", minLength: 1 },
    lastname: { required: true, type: "string", minLength: 1 },
  },
};

const loginSchema = {
  body: {
    email: { required: true, type: "string", email: true },
    password: { required: true, type: "string" },
  },
};

const createGroupSchema = {
  body: {
    name: { required: true, type: "string", minLength: 3, maxLength: 100 },
    description: { required: false, type: "string" },
    is_private: { required: false, type: "boolean" },
  },
};

const createChannelSchema = {
  body: {
    name: { required: true, type: "string", minLength: 1, maxLength: 100 },
    type: { required: false, type: "string", enum: ["text", "voice"] },
  },
};

const initiateCallSchema = {
  body: {
    receiver_id: { required: false, type: "string", uuid: true },
    group_id: { required: false, type: "string", uuid: true },
    call_type: { required: true, type: "string", enum: ["audio", "video"] },
  },
};

module.exports = {
  validateRegister: validateRequest(registerSchema),
  validateLogin: validateRequest(loginSchema),
  validateCreateGroup: validateRequest(createGroupSchema),
  validateCreateChannel: validateRequest(createChannelSchema),
  validateInitiateCall: validateRequest(initiateCallSchema),
};
