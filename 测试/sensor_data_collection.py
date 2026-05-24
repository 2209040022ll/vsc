"""
HUTB 传感器数据采集模板
用于采集车辆状态、摄像头、激光雷达和毫米波雷达数据。
"""

import csv
import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/city_crossing.scene")
    car = hutb.create_vehicle("sedan", (0, 0, 0), color="green")

    camera = hutb.add_sensor(car, "camera", position=(0, 0, 1.6))
    lidar = hutb.add_sensor(car, "lidar", position=(0, 0, 2.2))
    radar = hutb.add_sensor(car, "radar", position=(0.8, 0, 1.2))
    hutb.update_sensor_params(camera, sample_rate=30, fov=90)
    hutb.update_sensor_params(lidar, sample_rate=20, fov=120)

    hutb.start_simulation(realtime=True)

    with open("hutb_sensor_log.csv", "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["step", "x", "y", "speed", "camera", "lidar", "radar"])

        try:
            for step in range(600):
                hutb.set_vehicle_control(car, throttle=0.5, brake=0.0, steer=0.0)
                hutb.step(delta_time=0.02)

                state = hutb.get_vehicle_state(car)
                camera_data = hutb.get_sensor_data(camera)
                lidar_data = hutb.get_sensor_data(lidar)
                radar_data = hutb.get_sensor_data(radar)
                writer.writerow([
                    step,
                    state.position.x,
                    state.position.y,
                    state.speed,
                    camera_data,
                    lidar_data,
                    radar_data,
                ])
        finally:
            hutb.stop_simulation()
            hutb.destroy(sim)


if __name__ == "__main__":
    main()
