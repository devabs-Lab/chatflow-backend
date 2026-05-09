const pool = require("../db/dbconfig");
const bcrypt = require("bcrypt");
const { StatusCodes } = require("http-status-codes");
const jwt = require("jsonwebtoken");

async function register(req, res) {
  const { username, firstname, lastname, email, password } = req.body;
  //   console.log(email);
  if (!email || !password || !firstname || !lastname || !username) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: "please provide all required information!" });
  }

  try {
    const usernameExists = await pool.query(
      "SELECT userid FROM users WHERE username = $1",
      [username],
    );

    const emailExists = await pool.query(
      "SELECT userid FROM users WHERE email = $1",
      [email],
    );
    if (usernameExists.rows.length > 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Username is already taken" });
    }

    if (emailExists.rows.length > 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Email is already registered" });
    }
    if (password.length < 8) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "the password must be greater than 8 characters" });
    }
    //   encrypt the password
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);

    await pool.query(
      "INSERT INTO users(username, firstname, lastname , email ,password) VALUES ($1,$2,$3,$4,$5)",
      [username, firstname, lastname, email, hashedpassword],
    );

    return res.status(StatusCodes.CREATED).json({ msg: "user created" });
  } catch (error) {
    console.log(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "something went wrong , try again later" });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "something went wrong, try again later" });
  }

  try {
    const userResult = await pool.query(
      "select username,userid,password from users where email = $1",
      [email],
    );
    const user = userResult.rows[0];

    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Invalid credential" });
    }

    // compare password

    const ismatch = await bcrypt.compare(password, user.password);
    if (!ismatch) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Invalid password credential" });
    }

    const username = user.username;
    const userid = user.userid;
    const token = jwt.sign({ username, userid }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const result = await pool.query(
      `
      SELECT 
        userid,
        username,
        avatar_url,
        bio,
        department,
        phone
      FROM users
      WHERE userid = $1
      `,
      [userid],
    );

    const users = result.rows[0];

    res.status(StatusCodes.OK).json({
      token,
      msg: "valid user login successfully ",
      userid: users.userid,
      username: users.username,
      avatar_url: users.avatar_url,
      bio: users.bio,
      department: users.department,
      phone: users.phone,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.BAD_REQUEST);
  }
}

async function usernameprovider(req, res) {
  const userid = req.query.userid;

  try {
    const userResult = await pool.query(
      "select username from users where userid = $1",
      [userid],
    );
    const user = userResult.rows[0];
    res.status(StatusCodes.OK).json(user);
  } catch (error) {
    console.log(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "something went wrong , try again later" });
  }
}

async function check(req, res) {
  try {
    const userid = req.user.userid;

    const result = await pool.query(
      `
      SELECT 
        userid,
        username,
        avatar_url,
        bio,
        department,
        phone
      FROM users
      WHERE userid = $1
      `,
      [userid],
    );

    const user = result.rows[0];

    res.status(StatusCodes.OK).json({
      msg: "valid user",
      userid: user.userid,
      username: user.username,
      avatar_url: user.avatar_url,
      bio: user.bio,
      department: user.department,
      phone: user.phone,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      msg: "Server error",
    });
  }
}

const updateUserProfile = async (req, res) => {
  const userId = req.user.userid;
  const { bio, phone, department } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET bio = $1, phone = $2, department = $3, updated_at = CURRENT_TIMESTAMP
       WHERE userid = $4
       RETURNING userid, username, avatar_url, bio, phone, department`,
      [bio, phone, department, userId],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const uploadAvatar = async (req, res) => {
  const userId = req.user.userid;
  const file = req.file;

  console.log(
    "Received avatar upload request for user:",
    userId,
    "with file:",
    file,
  );

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // const avatarUrl = `/uploads/${file.filename}`; this is for local streaming
  const avatarUrl = file.path || file.url;

  try {
    await pool.query("UPDATE users SET avatar_url = $1 WHERE userid = $2", [
      avatarUrl,
      userId,
    ]);

    res.json({
      message: "Avatar updated",
      avatar_url: avatarUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update avatar" });
  }
};

module.exports = {
  register,
  login,
  check,
  usernameprovider,
  updateUserProfile,
  uploadAvatar,
};
