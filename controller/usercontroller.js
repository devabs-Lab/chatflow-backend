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
      [username]
    );

    const emailExists = await pool.query(
      "SELECT userid FROM users WHERE email = $1",
      [email]
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
      [username, firstname, lastname, email, hashedpassword]
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
      [email]
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
    // console.log(token, username, userid);
    return res
      .status(StatusCodes.OK)
      .json({ msg: "user login successfully ", token, username, userid });
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
      [userid]
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
  const username = req.user.username;
  const userid = req.user.userid;
  res.status(StatusCodes.OK).json({ msg: "valid user", username, userid });
}

module.exports = { register, login, check, usernameprovider };
