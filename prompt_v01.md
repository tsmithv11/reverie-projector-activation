Improve this prompt to design an activation that will be projected onto a screen. It should be runable on a Macbook with an external webcam. It may also need to run on a Linux box, but that will come later.

- It should be highly reliable
- It should be designed for a lot of people
- It should rotate scenes every 30-60 seconds (adjustable in the settings). Default is 60 seconds.
- It should run in full screen mode
- The scenes will be:
  - Bounding boxes and heatmap (faked) that runs locally like the first image of the boat but it will be of the people
  - The scene stays static but the people are converted into robots like the second image. Use Lucy 2.5 and I will provide the FAL API key
  - The scene will be converted into a cartoonish scene with monsters (like the third image). Walking by causes bubbles to form and the monsters try to pop the bubbles. This will run locally.
  - The scene will look like the fourth scene and be a shot of the people on camera but converted into lines with bounding boxes. This will run locally.
  - Movement causes vines and flowers to grow and mushrooms to grow. When people pause, butterflies gather around them. This will run locally.
- It should be extensible to allow me to add more scenes in the future.