const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const Usersf = require("./models/user");
require("dotenv").config({ path: "../.env" });
const flash = require("connect-flash");
const session = require("express-session");
const { generateToken, verifyToken } = require("./middleware/isloggedin.js");
const cookieParser = require("cookie-parser");
const { stringify } = require("querystring");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());


const COLAB_SERVER_URL = "https://0747-34-125-127-120.ngrok-free.app"; // Update this
// ✅ Setup session middleware before flash()
app.use(
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: true
    })
);
app.use(flash());

// ✅ Pass flash messages to every route
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

mongoose.connect("mongodb://127.0.0.1:27017/Usersf", {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.log("MongoDB Connection Error:", err));

// ✅ Set 'views' directory
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // ✅ Needed for JSON body parsing

// ✅ Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => cb(null, "photo.jpg"),
});
const upload = multer({ storage });

app.get("/help",verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("post_help", { user: req.user });
    }
    else{
        res.render("help")
    } 
});
app.get("/login", (req, res) => {
    res.render("login")
});
app.get("/about",verifyToken, (req, res) => {
    const user = req.user;
    console.log(user);
    if(user){
        res.render("post_about", { user: req.user });
    }
    else{
        res.render("about")
    }
});

app.get("/", verifyToken,(req, res) => {
    const user = req.user;
    if(user){
        res.render("post_index",{user:req.user});
    }
    else{
        res.render("index");
    }
});
app.get("/logout", (req, res) => {
    res.clearCookie("token"); // ✅ Remove JWT Cookie
    req.session.destroy((err) => { // ✅ Destroy session (if any)
        if (err) {
            console.error("Session destruction error:", err);
            return res.redirect("/");
        }
        res.redirect("/login"); // ✅ Redirect to login page after logout
    });
});

// ✅ Register Route (Create & Send JWT Token)
app.post("/register", async (req, res) => {
    try {
        const { username, email, password, age, gender } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new Usersf({ username, email, password: hashedPassword, age: Number(age), gender: gender });
        await newUser.save();
        const token = generateToken(newUser);

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // ✅ Secure in production
            maxAge: 2 * 60 * 60 * 1000, // ✅ 2 hours expiry
        });

        req.flash("welcome", "Welcome to the site!");
        //res.json({ message: "User registered successfully", token }); // ✅ Send JWT to frontend
        res.render("post_index",{user:newUser});

    } catch (error) {
        res.status(500).json({ error: "Error registering user" });
    }
});

// ✅ Login Route (Authenticate & Send JWT Token)
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Usersf.findOne({ email });

        if (!user) {
            req.flash("error", "User not found");
            return res.status(401).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash("error", "Invalid credentials");
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // ✅ Generate JWT Token
        const token = generateToken(user);

        // ✅ Set the token as a cookie (HTTP-only for security)
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // ✅ Secure in production
            maxAge: 2 * 60 * 60 * 1000, // ✅ 2 hours expiry
        });

        req.flash("welcome", `Welcome back, ${user.username}!`);
        res.redirect("/");
    } catch (error) {
        res.status(500).json({ error: "Error logging in" });
    }
});

app.get("/user/upload",verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("post_upload", { user: req.user });
    }
    else{
        res.render("login")
    }
});
// ✅ Route: Upload image & process with YOLO
app.post("/upload", verifyToken, upload.single("image"), async(req, res) => {
    const useremail = req.user.email;
    const userData = await Usersf.findOne({ email: useremail });
    console.log(userData.email);
    const imagePath = path.join(__dirname, "../Server/uploads/photo.jpg");
    const pythonProcess = spawn("python3", ["../python/script.py", imagePath]);
    const pdfPath = path.join(__dirname, "uploads", "result.pdf");

    let faceshape = "";

    pythonProcess.stdout.on("data", (data) => {
        faceshape += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
        console.error(`[Python Error]: ${data}`);
    });

    pythonProcess.on("close", async (code) => {
        console.log(`Python exited with code ${code}`);
        console.log("Faceshape from Python:", faceshape.trim());

        if (!faceshape.trim()) {
            return res.json({ success: false, message: "No data received from Python script." });
        }

        const jsonMatch = faceshape.match(/\{.*\}/s);
        if (!jsonMatch) {
            return res.json({ success: false, message: "Invalid JSON format from Python script." });
        }

        let faceData;
        try {
            faceData = JSON.parse(jsonMatch[0]);
        } catch (error) {
            return res.json({ success: false, message: "Failed to parse JSON from Python output." });
        }

        const { AcnePrediction, FaceShape, SkinType, Wrinkles } = faceData;
        console.log("Extracted Data:", faceData);

        try {
            const aiResponses = await Promise.all([
                model.generateContent(`Based on the provided FaceShape (${FaceShape}), suggest the following details clearly:
                    FACESHAPE: ${FaceShape}
                    Best Hairstyles:-
                    1. [Hairstyle 1]  
                    2. [Hairstyle 2]  
                    DEPENDING ON GENDER:${userData.gender}
                    JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`),
                model.generateContent(`Based on the provided FaceShape (${FaceShape}), suggest the following details clearly:
                    FACESHAPE: ${FaceShape}
                    Best Beard Styles:-
                    1. [Beard Style 1]  
                    2. [Beard Style 2]
                    JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`),
                model.generateContent(`Based on the provided FaceShape (${FaceShape}), suggest the following details clearly:
                    FACESHAPE: ${FaceShape}
                    Best Spectacles:-  
                    1. [Spectacle Type 1]  based on faceshape
                    2. [Spectacle Type 2]  based on faceshape
                    DEPENDING ON GENDER:${userData.gender}
                    JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`),
                model.generateContent(`VITAMIN B6/B12:-
                    Acne : ${AcnePrediction} 
                    If Acne > 5 than provide the vitamine deficiency which could cause this and give a diet plan according to it else just say you have clear skin 
                    JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`),
                model.generateContent(`SkinType:-
                    ${SkinType} - First tell if it exist
                    Give potential vitamin/mineral needs and related food sources If person have oily/dry skin else You have Normal Skin.${SkinType}.
                    JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`),
                model.generateContent(`VITAMIN A/C ${Wrinkles}
                    if ${Wrinkles} doesnt exist say YOU DO NOT HAVE DEFICIENCY
                    Give potential vitamin/mineral needs and related food sources If person have wrinkle .${Wrinkles}
                    if there is no wrinkle just say you have clear skin JUST WRITE WHATEVER I ASKED NOT MORE THAN THAT`)
            ]);

            const [looksHair, looksBeard, looksSpecs, acne, skin, Wrinkle] = aiResponses.map(response => response.response.text());
            req.session.looksHair = looksHair;
            req.session.looksBeard = looksBeard;
            req.session.looksSpecs = looksSpecs;
            req.session.acne = acne;
            req.session.skin = skin;
            req.session.wrinkle = Wrinkle;
            const llmvalue = `along with ${AcnePrediction}, ${SkinType} skin and very few ${Wrinkles}`
            req.session.llmvalue = llmvalue;
            // In your /upload route
            req.session.userData = userData;
            req.session.imagePath = imagePath;
            req.session.pdfPath = pdfPath;
            req.session.gender = userData.gender;
            console.log("REACHED")

            res.json({ success: true, pdfUrl: "/llm" });
            
        } catch (error) {
            console.error("[AI Error]:", error);
            res.json({ success: false, message: "Error generating text." });
        }
    });
});
app.get("/llm",verifyToken,(req,res) => {
    const user = req.user;
    if(user){
        res.render("LLM", { user: req.user ,llm_response: null});
    }
})
app.post("/predict", async (req, res) => {
    try {
        const llmvalue = req.session.llmvalue;
        const gender = "I am" + req.session.gender;
        const payload = {
          input_text: req.body.input_text + gender +    llmvalue + "GENERATE FIVE QUESTIONS BASED ON THE PROBLEM THAT CAN CURE THE ISSUE"
        };
        const response = await axios.post(`${COLAB_SERVER_URL}/predict`, payload);
        const rsp = JSON.stringify(response.data) + "Just extract all 5 ques seperated by |";
        const aiResponses = await model.generateContent(rsp);
        const summaryText = aiResponses.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Raw Response:", rsp);

        const questions = [];
        let s = "";

        for (let i = 0; i < summaryText.length; i++) {
            const element = summaryText[i]; // Define element before using it
            
            if (element === "|") {
                questions.push(s);
                s = "";
                continue;
            }
        
            s += element;
        }
        
        if (s) {
            questions.push(s);
        }


        console.log("Extracted Questions:", questions);
        res.json({ questions });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Failed to fetch prediction" });
    }
});

app.post("/submit", async (req, res) => {
    const responses = req.body.responses; // Array of { question, answer }
    const originalData = req.body.llmvalue;
    const { userData, imagePath, pdfPath } = req.session;

    if (!imagePath || !pdfPath) {
        console.error("Error: Missing imagePath or pdfPath");
        return res.status(500).json({ error: "Missing file paths in session." });
    }
    

    // Merge original data and Q&A pairs into a single string
    let mergedPrompt = `Original Input: ${originalData}\n\nQuestions and Answers:\n`;
    responses.forEach((item, index) => {
        mergedPrompt += `Q${index + 1}: ${item.question}\n`;
        mergedPrompt += `A${index + 1}: ${item.answer}\n`;
    });

    // Log the merged prompt for debugging purposes
    console.log("Merged Prompt:", mergedPrompt);

    // Prepare the payload as a string
    const payload = { input_text: mergedPrompt };

    try {
        // Send the merged prompt to your model's endpoint (e.g., /predict)
        // Use Google Generative AI to generate a summary
        const summaryInput = `Based on Q and A suggest the things he can do  ${JSON.stringify(mergedPrompt)} keep it quite consise Your response must not consist visit a dermatologist `;
        const aiResponses = await model.generateContent(summaryInput);
        console.log(aiResponses)
        const summaryText = aiResponses.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(summaryText)
        const looksHair = req.session.looksHair;
        const looksBeard = req.session.looksBeard;
        const looksSpecs = req.session.looksSpecs;
        const acne = req.session.acne;
        const skin = req.session.skin;
        const wrinkle = req.session.wrinkle;
        createPDF(userData, imagePath, pdfPath, looksHair, looksBeard, looksSpecs, acne, skin, wrinkle, summaryText, res);
        // res.json({ llm_response: trimmedText });
    } catch (error) {
        console.error("Error calling LLM:", error.message);
        res.status(500).json({ error: "LLM call failed" });
    }
});

app.get("/download", (req, res) => {
    const pdfPath = path.join(__dirname, "uploads", "result.pdf");
    res.download(pdfPath, "Face_Detection_Result.pdf", (err) => {
        if (err) console.error("[PDF Download Error]:", err);
        fs.unlink(pdfPath, (err) => {
            if (err) console.error("[File Delete Error]:", err);
        });
    });
});

function createPDF(userData, imagePath, outputPath, looksHair, looksBeard, looksSpecs, acne, skin, wrinkle, trimmedText,res) {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const pdfStream = fs.createWriteStream(outputPath);
    doc.pipe(pdfStream);

    // Title
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#2B547E").text("User Report", { align: "center" }).moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#2B547E").stroke().moveDown(1);
    
    // Contact Information Section
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("CONTACT INFORMATION:", 55, 105).moveDown(0.5);
    doc.font("Helvetica-Bold").text("USERNAME:", 50).font("Helvetica").fillColor("#444").text(userData.username || "N/A", 150, doc.y - 12);
    doc.font("Helvetica-Bold").text("EMAIL:", 50).font("Helvetica").fillColor("#444").text(userData.email || "N/A", 150, doc.y - 12);
    doc.font("Helvetica-Bold").text("AGE:", 50).font("Helvetica").fillColor("#444").text(userData.age || "N/A", 150, doc.y - 12);
    doc.font("Helvetica-Bold").text("GENDER:", 50).font("Helvetica").fillColor("#444").text(userData.gender || "N/A", 150, doc.y - 12);

    // User Image
    const imageX = 400, imageY = 120, radius = 60;
    if (fs.existsSync(imagePath)) {
        doc.save();
        // Clip the image to a circular shape
        doc.circle(imageX + radius, imageY + radius, radius).clip();
        // Place the image within the clipped area
        doc.image(imagePath, imageX, imageY, { width: radius * 2, height: radius * 2 });
        doc.restore();
    
        // Draw a black border around the circular image
        doc.circle(imageX + radius, imageY + radius, radius)
           .strokeColor('#000000') // Set the stroke color to black
           .lineWidth(2) // Set the border thickness
           .stroke();
    } else {
        console.error("Image not found at:", imagePath);
    }

    // Analysis Section
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("CLASSES:", 50, 250).moveDown(2);
    doc.font("Helvetica-Bold").text("BEST SPECTACLES:", 50).font("Helvetica").fillColor("#444").text(looksSpecs || "N/A", 200, doc.y - 16).moveDown(2);
    doc.font("Helvetica-Bold").text("BEST HAIRSTYLES:", 50).font("Helvetica").fillColor("#444").text(looksHair || "N/A", 200, doc.y - 16).moveDown(2);
    if(userData.gender == "Male"){
        doc.font("Helvetica-Bold").text("BEST BEARD:", 50).font("Helvetica").fillColor("#444").text(looksBeard || "N/A", 200, doc.y - 16).moveDown(2);
    }
    doc.font("Helvetica-Bold").text("VITAMIN B6/B12:", 50).font("Helvetica").fillColor("#444").text(acne || "N/A", 200, doc.y - 16).moveDown(2);
    doc.font("Helvetica-Bold").text("SKIN TYPE:", 50).font("Helvetica").fillColor("#444").text(skin || "N/A", 200, doc.y - 16).moveDown(2);
    // doc.font("Helvetica-Bold").text("VITAMIN A/C:", 50).font("Helvetica").fillColor("#444").text(wrinkle || "N/A", 200, doc.y - 16).moveDown(2);
    doc.font("Helvetica-Bold").text("FINAL RESULT:", 50).font("Helvetica").fillColor("#444").text(trimmedText || "N/A", 200, doc.y - 16)

    // Finalize PDF
    doc.end();
    pdfStream.on("finish", () => {
        console.log("PDF Created Successfully");
        res.json({ success: true, pdfUrl: "/download" });
    });
    pdfStream.on("error", (err) => {
        console.error("[PDF Write Error]:", err);
        res.json({ success: false, message: "Failed to generate PDF." });
    });
}



// Start server
app.listen(8000, () => console.log("Server running on http://localhost:5000"));
