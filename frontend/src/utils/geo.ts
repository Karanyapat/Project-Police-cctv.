// ฟังก์ชันคำนวณระยะทางระหว่างสองจุดด้วยสูตร Haversine (หน่วย: เมตร)
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number  {
    const R = 6371e3; // รัศมีโลก (เมตร)
    const φ1 = (lat1 * Math.PI) / 180; // ละติจูด 1 (เรเดียน)
    const φ2 = (lat2 * Math.PI) / 180; // ละติจูด 2 (เรเดียน)
    const Δφ = ((lat2 - lat1) * Math.PI) / 180; // ความต่างละติจูด
    const Δλ = ((lon2 - lon1) * Math.PI) / 180; // ความต่างลองจิจูด

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // ระยะทาง (เมตร)
};