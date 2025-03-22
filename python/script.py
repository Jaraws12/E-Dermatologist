import sys
import json
import warnings
import os
import torch
import numpy as np
import cv2
from copy import deepcopy
from PIL import Image
from torchvision import transforms
from torchvision.models import resnet50, ResNet50_Weights
import torch.nn as nn
from ultralytics import YOLO

warnings.filterwarnings("ignore")
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

# Load skin type model

def detect_face_shape(image_path):
    """Detects face shape using YOLO."""
    
    class_labels = ["Oval", "Round", "Square", "Heart", "Oblong"]
    shape_model = YOLO("/home/yash/Desktop/Lets-Try/python/FaceShape.pt")
    
    results = shape_model(image_path, verbose=False)
    
    for result in results:
        if len(result.boxes) > 0:
            face_class = int(result.boxes[0].cls[0])
            return {"FaceShape": class_labels[face_class]}
    
    return {"error": "No face shape detected"}

def detect_skin_type(image_path):
    IMG_SIZE = 224

# Define transformations
    transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),  # Resize first
        transforms.ToTensor(),  # Convert to tensor
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])  # Normalize
    ])

    # Load ResNet model
    resnet = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
    num_ftrs = resnet.fc.in_features
    resnet.fc = nn.Linear(num_ftrs, 3)  # Adjust for 3 classes

    # Copy and load model
    model = deepcopy(resnet)
    checkpoint = torch.load("/home/yash/Desktop/Lets-Try/python/Oily.pth", map_location=torch.device("cpu"))

    # Remove mismatching keys
    for key in ["fc.weight", "fc.bias"]:
        if key in checkpoint:
            del checkpoint[key]

    model.load_state_dict(checkpoint, strict=False)
    model.eval()
    """Predicts skin type from image."""
    if not os.path.exists(image_path):
        return {"error": "Image not found"}

    skin_types = {0: "dry", 1: "normal", 2: "oily"}
    
    # Load and transform image
    img = Image.open(image_path).convert("RGB")
    img = transform(img).unsqueeze(0)  # Transform and add batch dimension
    
    # Predict skin type
    with torch.no_grad():
        out = model(img)
        skin_type = skin_types[out.argmax(1).item()]
    
    return {"SkinType": skin_type}

def detect_acne(image_path):
    """Detects acne using YOLO model."""
    acne_model = YOLO("/home/yash/Desktop/Lets-Try/python/Acne.pt")
    
    img = cv2.imread(image_path)
    if img is None:
        return {"error": "Invalid image"}
    
    results = acne_model(img, conf=0.25)
    acne_count = sum(1 for result in results for _ in result.boxes)
    
    return {"AcnePrediction": acne_count}

import cv2
from ultralytics import YOLO

def detect_wrinkles(image_path):
    """Detects wrinkles using YOLO model."""
    
    # Load the YOLO model
    wrinkle_model = YOLO("/home/yash/Desktop/Lets-Try/python/wrinkles.pt")

    # Read the image
    img = cv2.imread(image_path)
    if img is None:
        return {"error": "Invalid image"}

    # Run inference
    results = wrinkle_model(img)

    # Extract detection results
    wrinkles = []
    for result in results:
        for box in result.boxes:  # YOLOv8 stores detections in result.boxes
            label = result.names[int(box.cls[0])]  # Get class label
            confidence = float(box.conf[0])  # Get confidence score
            bbox = box.xyxy[0].tolist()  # Get bounding box

            wrinkles.append({
                "label": label,
                "confidence": confidence,
                "bbox": bbox
            })

    return {"Wrinkles": label}


def main(image_path):
    """Executes all detections and returns results as JSON."""
    try:
        face_shape_result = detect_face_shape(image_path)
        acne_result = detect_acne(image_path)
        skin_type_result = detect_skin_type(image_path)
        wrinkle_result = detect_wrinkles(image_path)

        result = {**acne_result, **face_shape_result, **skin_type_result, **wrinkle_result}
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))  # ✅ Print error in JSON format
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image provided"}))
        sys.exit(1)
    
    main(sys.argv[1])
