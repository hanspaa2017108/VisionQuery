from ultralytics import solutions

inf = solutions.Inference(
    model="yolo26n.pt",  # you can use any model that Ultralytics supports, e.g., YOLO26, or a custom-trained model
)

inf.inference()

# Make sure to run the file using command `streamlit run path/to/file.py`