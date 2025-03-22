const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config(); // ✅ Load environment variables

const SECRET_KEY = process.env.JWT_SECRET || "password"; // ✅ Fallback Secret Key
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h"; // ✅ Default Expiration

// ✅ Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, username: user.username, email: user.email }, // ✅ More user data
        SECRET_KEY,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// ✅ Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.cookies.token || req.headers["authorization"]?.replace("Bearer ", "");

    if (!token) {
        req.user = ""
        next()
    }
    else{
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            req.user = decoded; // ✅ Attach user data to request
            next();
        } catch (err) {
            return res.json("DU"); // ✅ Expired/Invalid token
        }
    }
};

module.exports = { generateToken, verifyToken };
